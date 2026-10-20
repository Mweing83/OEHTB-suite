import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { applyUpsert } from "../lib/provision";
import { tokenSignieren } from "../lib/suiteAuth";
import { resetDb } from "../test/helfer";
import { pseudonymisieren, reIdentifizieren } from "./pseudonym";
import { istUebernahmefaehig, type AufbereitetesErgebnis } from "./anfrage";

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
