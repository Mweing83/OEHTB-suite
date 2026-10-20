import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { applyUpsert } from "../lib/provision";
import { tokenSignieren } from "../lib/suiteAuth";
import { resetDb } from "../test/helfer";

// Integrationstests laufen nur mit ausdruecklich gesetzter Testdatenbank.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

async function cookieFuer(sub: string, rolle: string): Promise<string> {
  await applyUpsert({ suiteUserId: sub, benutzername: sub, name: sub, email: null, aktiv: true, rolle });
  const jetzt = Date.now();
  return `suite_token=${tokenSignieren({
    sub,
    benutzername: sub,
    name: sub,
    zugriff: { stunden: rolle },
    letzteAktivitaet: jetzt,
    geprueftAm: jetzt,
  })}`;
}

// Security-Audit 2026-10: Art.-17-Loeschung muss alle Kopien der Person entfernen.
run("DSGVO-Loeschung (Stunden, Integration)", () => {
  let admin: string;
  let leser: string;
  let personId: string;
  let anfrageId: string;

  beforeEach(async () => {
    await resetDb();
    admin = await cookieFuer("suite-admin", "admin");
    leser = await cookieFuer("suite-leser", "leser");
    const p = await prisma.mitarbeiter.create({
      data: { vorname: "Annabell", nachname: "Mayerhofer", personalnummer: "P-4711", email: "a.mayerhofer@example.org" },
    });
    personId = p.id;
    const a = await prisma.aenderungsanfrage.create({
      data: {
        rohtext: "Bitte Annabell Mayerhofer (P-4711, a.mayerhofer@example.org) ab 1.6. auf 20h. Frau Mayerhofer ist informiert.",
        quelle: "PASTE",
        status: "ZUR_BESTAETIGUNG",
        pseudonymMapping: { PERSON_1: p.id, PERSON_2: "andere-person" },
        parseErgebnis: { mitarbeiterId: p.id, personPlatzhalter: "PERSON_1", neuStunden: 20 },
      },
    });
    anfrageId = a.id;
  });

  for (const modus of ["hart", "anonymisieren"] as const) {
    it(`entfernt die Person aus allen Anfragen (${modus})`, async () => {
      const url = `/api/mitarbeiter/${personId}${modus === "hart" ? "?hart=1" : ""}`;
      const r = await request(app).delete(url).set("Cookie", admin);
      expect(r.status).toBe(200);

      const a = await prisma.aenderungsanfrage.findUniqueOrThrow({ where: { id: anfrageId } });
      expect(a.rohtext).not.toMatch(/Mayerhofer|Annabell|P-4711|example\.org/);
      expect(a.rohtext).toContain("PERSON_1");
      expect(a.pseudonymMapping).toEqual({ PERSON_2: "andere-person" });
      expect((a.parseErgebnis as Record<string, unknown>).mitarbeiterId).toBeNull();

      const liste = await request(app).get("/api/anfragen").set("Cookie", leser);
      expect(JSON.stringify(liste.body)).not.toMatch(/Mayerhofer|P-4711/);
      expect(JSON.stringify(liste.body)).not.toContain(personId);

      const audit = await prisma.auditLog.findMany({ where: { betroffenerMitarbeiterId: personId } });
      expect(JSON.stringify(audit)).not.toContain("P-4711");
    });
  }
});
