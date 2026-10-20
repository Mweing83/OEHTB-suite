import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe, type Basis } from "../test/helfer.js";

// Integrationstests laufen nur, wenn ausdrücklich eine Testdatenbank gesetzt ist.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Regressionstests zu den Findings des Security-Audits 2026-10.
run("Security-Audit 2026-10: Handkassen-Fixes (Integration)", () => {
  let basis: Basis;

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
  });

  // --- Abschlussliste nur für eigene Kostenstellen -------------------------
  it("GET /api/abschluss ohne Filter liefert erfasser/leitung nur eigene Kostenstellen", async () => {
    await prisma.abschluss.createMany({
      data: [
        { kostenstelleId: basis.ksA, jahr: 2026, monat: 4, zaehllisteCent: 100 },
        { kostenstelleId: basis.ksB, jahr: 2026, monat: 4, zaehllisteCent: 999 },
      ],
    });
    for (const name of ["erfasser", "leitung"]) {
      const r = await (await alsAgent(name)).get("/api/abschluss");
      expect(r.status).toBe(200);
      expect(r.body.map((a: { kostenstelleId: number }) => a.kostenstelleId)).toEqual([basis.ksA]);
    }
    const f = await (await alsAgent("finanzen")).get("/api/abschluss");
    expect(f.body).toHaveLength(2);

    const fremd = await (await alsAgent("erfasser")).get(`/api/abschluss?kostenstelle=${basis.ksB}`);
    expect(fremd.status).toBe(403);
    const kaputt = await (await alsAgent("erfasser")).get("/api/abschluss?kostenstelle=abc");
    expect(kaputt.status).toBe(400);
  });

  // --- Statusmaschine des Monatsabschlusses -------------------------------
  it("erzwingt die Reihenfolge einreichen -> prüfen -> freigeben und sperrt danach endgültig", async () => {
    const erfasser = await alsAgent("erfasser");
    const leitung = await alsAgent("leitung");
    const finanzen = await alsAgent("finanzen");
    const einreichen = (z: number) =>
      erfasser
        .post("/api/abschluss/einreichen")
        .send({ kostenstelleId: basis.ksA, jahr: 2026, monat: 5, zaehllisteCent: z });

    const e = await einreichen(1000);
    expect(e.status).toBe(200);
    const id = e.body.id as number;

    // Freigeben ohne Prüfung -> 409
    expect((await finanzen.post(`/api/abschluss/${id}/freigeben`)).status).toBe(409);
    // erneut einreichen solange nur eingereicht -> erlaubt
    expect((await einreichen(1100)).status).toBe(200);

    expect((await leitung.post(`/api/abschluss/${id}/pruefen`)).status).toBe(200);
    // nochmals prüfen -> 409, einreichen nach Prüfung -> 409
    expect((await leitung.post(`/api/abschluss/${id}/pruefen`)).status).toBe(409);
    expect((await einreichen(5)).status).toBe(409);

    expect((await finanzen.post(`/api/abschluss/${id}/freigeben`)).status).toBe(200);
    expect((await finanzen.post(`/api/abschluss/${id}/freigeben`)).status).toBe(409);
    expect((await leitung.post(`/api/abschluss/${id}/pruefen`)).status).toBe(409);
    expect((await einreichen(5)).status).toBe(409);

    const a = await prisma.abschluss.findUniqueOrThrow({ where: { id } });
    expect(a.status).toBe("freigegeben");
    expect(a.zaehllisteCent).toBe(1100);

    // In den freigegebenen Monat kann nicht mehr gebucht werden.
    const b = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
    expect(b.status).toBe(409);
  });

  it("sperrt auch Altdaten, deren Status nach der Freigabe zurückgesetzt wurde", async () => {
    await prisma.abschluss.create({
      data: {
        kostenstelleId: basis.ksA,
        jahr: 2026,
        monat: 5,
        zaehllisteCent: 0,
        status: "eingereicht",
        freigegebenAm: new Date("2026-06-03"),
      },
    });
    const erfasser = await alsAgent("erfasser");
    const b = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
    expect(b.status).toBe(409);
    const e = await erfasser
      .post("/api/abschluss/einreichen")
      .send({ kostenstelleId: basis.ksA, jahr: 2026, monat: 5, zaehllisteCent: 1 });
    expect(e.status).toBe(409);
  });

  it("lehnt ungültige Monate beim Einreichen ab", async () => {
    const r = await (await alsAgent("erfasser"))
      .post("/api/abschluss/einreichen")
      .send({ kostenstelleId: basis.ksA, jahr: 2026, monat: 13, zaehllisteCent: 0 });
    expect(r.status).toBe(400);
  });

  // --- Fremde, verwaiste Belege -------------------------------------------
  it("nur der Hochladende kann einen Beleg zuordnen, und nur einmal", async () => {
    const fremd = await prisma.beleg.create({
      data: { dateipfad: "x.png", originalname: "x.png", hochgeladenVonId: basis.benutzer.leitungA },
    });
    const eigen = await prisma.beleg.create({
      data: { dateipfad: "y.png", originalname: "y.png", hochgeladenVonId: basis.benutzer.erfasserA },
    });
    const alt = await prisma.beleg.create({ data: { dateipfad: "z.png", originalname: "z.png" } });
    const erfasser = await alsAgent("erfasser");

    for (const belegId of [fremd.id, alt.id, "1", 999999]) {
      const r = await erfasser
        .post("/api/buchungen")
        .send(buchungEingabe(basis.ksA, basis.kontoId, { belegId }));
      expect(r.status).toBe(400);
    }
    expect(await prisma.buchung.count()).toBe(0);

    const ok = await erfasser
      .post("/api/buchungen")
      .send(buchungEingabe(basis.ksA, basis.kontoId, { belegId: eigen.id }));
    expect(ok.status).toBe(201);

    // Ein bereits zugeordneter Beleg kann nicht an eine zweite Buchung.
    const zweite = await erfasser
      .post("/api/buchungen")
      .send(buchungEingabe(basis.ksA, basis.kontoId, { belegId: eigen.id }));
    expect(zweite.status).toBe(400);

    // Auch beim Bearbeiten kein fremder Beleg.
    const bearbeiten = await erfasser
      .put(`/api/buchungen/${ok.body.id}`)
      .send(buchungEingabe(basis.ksA, basis.kontoId, { belegId: fremd.id }));
    expect(bearbeiten.status).toBe(400);
    const nachher = await prisma.buchung.findUniqueOrThrow({ where: { id: ok.body.id } });
    expect(nachher.belegId).toBe(eigen.id);
  });
  // --- Härtung: Buchungslogik ---------------------------------------------
  it("lehnt Positionen mit Betrag 0 oder negativ ab", async () => {
    const erfasser = await alsAgent("erfasser");
    const r = await erfasser.post("/api/buchungen").send(
      buchungEingabe(basis.ksA, basis.kontoId, {
        betragCent: 1000,
        positionen: [
          { betragCent: 2000, steuersatz: 20, kontoId: basis.kontoId },
          { betragCent: -1000, steuersatz: 20, kontoId: basis.kontoId },
        ],
      })
    );
    expect(r.status).toBe(400);
  });

  it("bucht nicht, wenn kein Steuersatz aktiv ist (kein stiller Rückfall)", async () => {
    await prisma.steuersatz.updateMany({ data: { aktiv: false } });
    const r = await (await alsAgent("erfasser"))
      .post("/api/buchungen")
      .send(buchungEingabe(basis.ksA, basis.kontoId));
    expect(r.status).toBe(400);
  });

  it("Anfangssaldo ist nach der ersten Freigabe gesperrt; falsche Typen -> 400", async () => {
    const admin = await alsAgent("admin");
    expect((await admin.put(`/api/admin/kostenstellen/${basis.ksA}`).send({ anfangssaldoCent: 500 })).status).toBe(200);
    await prisma.abschluss.create({
      data: { kostenstelleId: basis.ksA, jahr: 2026, monat: 4, zaehllisteCent: 0, status: "freigegeben", freigegebenAm: new Date() },
    });
    expect((await admin.put(`/api/admin/kostenstellen/${basis.ksA}`).send({ anfangssaldoCent: 900 })).status).toBe(409);
    expect((await admin.put(`/api/admin/kostenstellen/${basis.ksA}`).send({ bezeichnung: "Neu" })).status).toBe(200);
    expect((await admin.put(`/api/admin/kostenstellen/${basis.ksA}`).send({ bereichId: "x" })).status).toBe(400);
  });
});
