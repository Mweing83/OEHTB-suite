import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe, type Agent, type Basis } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("abschluss-Workflow (Integration)", () => {
  let basis: Basis;
  let erfasser: Agent;
  let leitung: Agent;
  let finanzen: Agent;

  beforeAll(async () => {
    await resetDb();
    await seedBasis();
    erfasser = await alsAgent("erfasser");
    leitung = await alsAgent("leitung");
    finanzen = await alsAgent("finanzen");
  });

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
  });

  it("durchläuft offen → eingereicht → geprüft → freigegeben und sperrt die Periode", async () => {
    // Eine Ausgabe im Mai 2026 erfassen.
    const rB = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
    expect(rB.status).toBe(201);
    const buchungId = rB.body.id;

    // Einreichen (Soll/Ist).
    const rEin = await erfasser
      .post("/api/abschluss/einreichen")
      .send({ kostenstelleId: basis.ksA, jahr: 2026, monat: 5, zaehllisteCent: -1000 });
    expect(rEin.status).toBe(200);
    expect(rEin.body.status).toBe("eingereicht");
    expect(rEin.body.sollCent).toBe(-1000); // ein Ausgang 10,00 €
    expect(rEin.body.differenzCent).toBe(0);
    const abschlussId = rEin.body.id;

    // Prüfen (Leitung).
    const rPr = await leitung.post(`/api/abschluss/${abschlussId}/pruefen`);
    expect(rPr.status).toBe(200);
    expect(rPr.body.status).toBe("geprueft");

    // Freigeben (Finanzen) → Periode gesperrt.
    const rFr = await finanzen.post(`/api/abschluss/${abschlussId}/freigeben`);
    expect(rFr.status).toBe(200);

    // Bestehende Buchung der Periode ist jetzt gesperrt.
    const b = await prisma.buchung.findUnique({ where: { id: buchungId } });
    expect(b!.gesperrt).toBe(true);

    // Neue Buchung in der freigegebenen Periode wird abgewiesen.
    const rNeu = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
    expect(rNeu.status).toBe(409);
  });

  it("lässt Erfasser einen Abschluss NICHT prüfen (403)", async () => {
    const rEin = await erfasser
      .post("/api/abschluss/einreichen")
      .send({ kostenstelleId: basis.ksA, jahr: 2026, monat: 5, zaehllisteCent: 0 });
    expect(rEin.status).toBe(200);

    const r = await erfasser.post(`/api/abschluss/${rEin.body.id}/pruefen`);
    expect(r.status).toBe(403);
  });

  it("lässt Leitung einen Abschluss NICHT freigeben (403)", async () => {
    const rEin = await erfasser
      .post("/api/abschluss/einreichen")
      .send({ kostenstelleId: basis.ksA, jahr: 2026, monat: 5, zaehllisteCent: 0 });
    const r = await leitung.post(`/api/abschluss/${rEin.body.id}/freigeben`);
    expect(r.status).toBe(403);
  });
});
