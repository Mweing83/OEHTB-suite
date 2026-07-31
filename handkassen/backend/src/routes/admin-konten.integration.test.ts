import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../server.js";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("Admin Konten-Freigaben (Integration)", () => {
  let bereichId = 0;

  beforeEach(async () => {
    await resetDb();
    const basis = await seedBasis();
    const ks = await prisma.kostenstelle.findUnique({ where: { id: basis.ksA }, select: { bereichId: true } });
    bereichId = ks!.bereichId;
  });

  it("legt ein Konto mit Bereichs-Freigaben an", async () => {
    const agent = await alsAgent("admin");
    const r = await agent.post("/api/admin/konten").send({
      nummer: "70000", bezeichnung: "Neu", bereichIds: [bereichId],
    });
    expect(r.status).toBe(201);
    const anzahl = await prisma.bereichKonto.count({ where: { kontoId: r.body.id, bereichId } });
    expect(anzahl).toBe(1);
  });

  it("liefert bereichIds beim Auflisten", async () => {
    const agent = await alsAgent("admin");
    const liste = (await agent.get("/api/admin/konten")).body as { nummer: string; bereichIds: number[] }[];
    const testkonto = liste.find((k) => k.nummer === "50000");
    expect(testkonto?.bereichIds).toContain(bereichId);
  });

  it("ersetzt die Freigabemenge per PUT", async () => {
    const konto = await prisma.konto.findUnique({ where: { nummer: "50000" } });
    const agent = await alsAgent("admin");
    const r = await agent.put(`/api/admin/konten/${konto!.id}`).send({
      bezeichnung: "Testkonto", bereichIds: [],
    });
    expect(r.status).toBe(200);
    const anzahl = await prisma.bereichKonto.count({ where: { kontoId: konto!.id } });
    expect(anzahl).toBe(0);
  });
});
