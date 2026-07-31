import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../server.js";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("Buchen: Konto-Freigabe je Bereich (Integration)", () => {
  let ksA = 0;
  let freigegeben = 0;
  let fremd = 0;

  beforeEach(async () => {
    await resetDb();
    const basis = await seedBasis();
    ksA = basis.ksA;
    freigegeben = basis.kontoId;
    const k = await prisma.konto.create({ data: { nummer: "60000", bezeichnung: "Fremd" } });
    fremd = k.id; // bewusst KEINE Freigabe
  });

  it("erlaubt Buchen mit freigegebenem Konto (201)", async () => {
    const agent = await alsAgent("erfasser");
    const r = await agent.post("/api/buchungen").send(buchungEingabe(ksA, freigegeben));
    expect(r.status).toBe(201);
  });

  it("lehnt Buchen mit nicht freigegebenem Konto ab (400) und legt nichts an", async () => {
    const agent = await alsAgent("erfasser");
    const r = await agent.post("/api/buchungen").send(buchungEingabe(ksA, fremd));
    expect(r.status).toBe(400);
    const anzahl = await prisma.buchung.count();
    expect(anzahl).toBe(0);
  });

  it("lehnt Korrigieren mit nicht freigegebenem Konto ab (400) und aendert nichts", async () => {
    const agent = await alsAgent("erfasser");
    const anlegen = await agent.post("/api/buchungen").send(buchungEingabe(ksA, freigegeben));
    expect(anlegen.status).toBe(201);
    const buchungId = anlegen.body.id;

    const r = await agent
      .post(`/api/buchungen/${buchungId}/korrigieren`)
      .send(buchungEingabe(ksA, fremd, { korrekturGrund: "Test" }));
    expect(r.status).toBe(400);

    // Kein Storno des Originals, keine Korrekturbuchung angelegt.
    const anzahl = await prisma.buchung.count();
    expect(anzahl).toBe(1);
    const original = await prisma.buchung.findUnique({ where: { id: buchungId } });
    expect(original?.storniert).toBe(false);
  });
});
