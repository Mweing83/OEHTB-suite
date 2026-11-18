import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { applyUpsert } from "../lib/provision";
import { tokenSignieren } from "../lib/suiteAuth";
import { resetDb } from "../test/helfer";
import { pseudonymisieren, reIdentifizieren, namensRegex } from "./pseudonym";
import { istUebernahmefaehig, type AufbereitetesErgebnis } from "./anfrage";
import { beschaeftigungsWerteSchema } from "./beschaeftigung";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Haertung nach Security-Audit 2026-10 (Stunden).
describe("Platzhalter und Uebernahme-Grenzen (Unit)", () => {
  it("loest nur echte, eigene PERSON_n-Eintraege auf", () => {
    const mapping = { PERSON_1: "m1" };
    expect(reIdentifizieren("PERSON_1", mapping)).toBe("m1");
    expect(reIdentifizieren("PERSON_2", mapping)).toBeNull();
    expect(reIdentifizieren("__proto__", mapping)).toBeNull();
    expect(reIdentifizieren("constructor", mapping)).toBeNull();
    expect(reIdentifizieren("toString", mapping)).toBeNull();
  });

  it("findet Namen mit Umlaut/ß/Akzent an der Wortgrenze, aber keine Teilwoerter", () => {
    const trifft = (name: string, text: string) => namensRegex(name).test(text);
    expect(trifft("Özdemir", "Bitte Herr Özdemir auf 30h")).toBe(true);
    expect(trifft("Groß", "Frau Groß reduziert")).toBe(true);
    expect(trifft("André", "Herr André ab Mai")).toBe(true);
    expect(trifft("Mayer", "Frau Mayer ab Mai")).toBe(true);
    expect(trifft("Mayer", "Frau Mayerhofer ab Mai")).toBe(false);
    expect(trifft("Groß", "Frau Großmann ab Mai")).toBe(false);
  });

  it("eine Stelle fuer die Wertgrenzen: Stunden bis 168, Ausmass bis 100 %, echtes Datum", () => {
    const ok = { wochenstunden: 38.5, ausmassProzent: 100, gueltigAb: "2026-06-01" };
    const gueltig = (w: object) => beschaeftigungsWerteSchema.safeParse({ ...ok, ...w }).success;
    expect(gueltig({})).toBe(true);
    expect(gueltig({ wochenstunden: 168 })).toBe(true);
    expect(gueltig({ wochenstunden: 168.5 })).toBe(false);
    expect(gueltig({ wochenstunden: 0 })).toBe(false);
    expect(gueltig({ ausmassProzent: 100.5 })).toBe(false);
    expect(gueltig({ ausmassProzent: 0 })).toBe(false);
    expect(gueltig({ gueltigAb: "01.06.2026" })).toBe(false);
    expect(gueltig({ gueltigAb: "2026-13-45" })).toBe(false);
  });

  it("uebernimmt automatisch nur Werte in den Grenzen des manuellen Bestaetigens", () => {
    const ok: AufbereitetesErgebnis = {
      mitarbeiterId: "m1",
      personPlatzhalter: "PERSON_1",
      neuStunden: 30,
      altStunden: null,
      ausmassProzent: 75,
      gueltigAb: "2026-06-01",
      konfidenz: 0.9,
      hinweis: null,
    };
    expect(istUebernahmefaehig(ok)).toBe(true);
    expect(istUebernahmefaehig({ ...ok, neuStunden: 500 })).toBe(false);
    expect(istUebernahmefaehig({ ...ok, neuStunden: 0 })).toBe(false);
    expect(istUebernahmefaehig({ ...ok, ausmassProzent: null })).toBe(false);
    expect(istUebernahmefaehig({ ...ok, ausmassProzent: 150 })).toBe(false);
    expect(istUebernahmefaehig({ ...ok, gueltigAb: "2026-13-45" })).toBe(false);
  });
});

run("Pseudonymisierung und Rollen (Stunden, Integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("pseudonymisiert auch inaktive Mitarbeiter und deren E-Mail", async () => {
    await prisma.mitarbeiter.create({
      data: {
        vorname: "Berta",
        nachname: "Ehemalig",
        personalnummer: "900",
        aktiv: false,
        email: "b.ehemalig@example.org",
      },
    });
    const { text, mapping } = await pseudonymisieren(
      "Frau Ehemalig (b.ehemalig@example.org) hat noch Stunden offen."
    );
    expect(text).not.toMatch(/Ehemalig|example\.org/);
    expect(Object.keys(mapping)).toEqual(["PERSON_1"]);
  });

  it("pseudonymisiert Namen mit Umlaut am Anfang bzw. ß am Ende", async () => {
    await prisma.mitarbeiter.createMany({
      data: [
        { vorname: "Emre", nachname: "Özdemir", personalnummer: "910" },
        { vorname: "Ida", nachname: "Groß", personalnummer: "911" },
      ],
    });
    const { text, mapping } = await pseudonymisieren("Herr Özdemir geht auf 30h, Frau Groß auf 20h.");
    expect(text).not.toMatch(/Özdemir|Groß/);
    expect(Object.keys(mapping)).toHaveLength(2);
  });

  it("Personalverrechnung darf Beschaeftigungen direkt anlegen", async () => {
    await applyUpsert({
      suiteUserId: "suite-pv",
      benutzername: "pv",
      name: "PV",
      email: null,
      aktiv: true,
      rolle: "personalverrechnung",
    });
    const jetzt = Date.now();
    const cookie = `suite_token=${tokenSignieren({
      sub: "suite-pv",
      benutzername: "pv",
      name: "PV",
      zugriff: { stunden: "personalverrechnung" },
      letzteAktivitaet: jetzt,
      geprueftAm: jetzt,
    })}`;
    const m = await prisma.mitarbeiter.create({
      data: { vorname: "Carl", nachname: "Test", personalnummer: "901" },
    });
    const r = await request(app)
      .post(`/api/mitarbeiter/${m.id}/beschaeftigung`)
      .set("Cookie", cookie)
      .send({ wochenstunden: 20, ausmassProzent: 50, gueltigAb: "2026-06-01" });
    expect(r.status).toBe(201);
  });
});
