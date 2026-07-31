import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../server.js";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("GET /konten?kostenstelle (Integration)", () => {
  let ksA = 0;

  beforeEach(async () => {
    await resetDb();
    const basis = await seedBasis();
    ksA = basis.ksA;
  });

  it("verlangt den kostenstelle-Parameter (400)", async () => {
    const agent = await alsAgent("admin");
    const r = await agent.get("/api/konten");
    expect(r.status).toBe(400);
  });

  it("liefert nur dem Bereich freigegebene, aktive Konten", async () => {
    const ks = await prisma.kostenstelle.findUnique({ where: { id: ksA }, select: { bereichId: true } });
    // nicht freigegebenes Konto
    await prisma.konto.create({ data: { nummer: "60000", bezeichnung: "Fremd" } });
    // freigegeben, aber inaktiv
    const inaktiv = await prisma.konto.create({ data: { nummer: "61000", bezeichnung: "Inaktiv", aktiv: false } });
    await prisma.bereichKonto.create({ data: { bereichId: ks!.bereichId, kontoId: inaktiv.id } });

    const agent = await alsAgent("admin");
    const r = await agent.get(`/api/konten?kostenstelle=${ksA}`);
    expect(r.status).toBe(200);
    const nummern = (r.body as { nummer: string }[]).map((k) => k.nummer);
    expect(nummern).toEqual(["50000"]); // nur das in seedBasis freigegebene aktive Konto
  });

  it("zeigt ein fuer mehrere Bereiche freigegebenes Konto in beiden Bereichen", async () => {
    const ksAentity = await prisma.kostenstelle.findUnique({ where: { id: ksA } });
    const bereich2 = await prisma.bereich.create({ data: { bezeichnung: "Zweitbereich" } });
    const ksC = await prisma.kostenstelle.create({
      data: { nummer: "3000", bezeichnung: "KS C", bereichId: bereich2.id, kassenartId: ksAentity!.kassenartId },
    });
    const gemein = await prisma.konto.create({ data: { nummer: "70000", bezeichnung: "Gemeinsam" } });
    await prisma.bereichKonto.createMany({
      data: [
        { bereichId: ksAentity!.bereichId, kontoId: gemein.id },
        { bereichId: bereich2.id, kontoId: gemein.id },
      ],
    });

    const agent = await alsAgent("admin");
    const inA = (await agent.get(`/api/konten?kostenstelle=${ksA}`)).body as { nummer: string }[];
    const inC = (await agent.get(`/api/konten?kostenstelle=${ksC.id}`)).body as { nummer: string }[];
    expect(inA.map((k) => k.nummer)).toContain("70000");
    expect(inC.map((k) => k.nummer)).toContain("70000");
  });
});
