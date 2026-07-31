import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db.js";
import { resetDb, seedBasis } from "../test/helfer.js";
import { pruefeKontenFreigabe } from "./kontoFreigabe.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("pruefeKontenFreigabe (Integration)", () => {
  let ksA = 0;
  let freigegeben = 0;

  beforeEach(async () => {
    await resetDb();
    const basis = await seedBasis();
    ksA = basis.ksA;
    freigegeben = basis.kontoId; // in seedBasis fuer den Bereich freigegeben
  });

  it("laesst ein freigegebenes, aktives Konto zu", async () => {
    const r = await pruefeKontenFreigabe(ksA, [freigegeben]);
    expect(r.ok).toBe(true);
  });

  it("lehnt ein nicht freigegebenes Konto ab", async () => {
    const fremd = await prisma.konto.create({ data: { nummer: "60000", bezeichnung: "Ohne Freigabe" } });
    const r = await pruefeKontenFreigabe(ksA, [fremd.id]);
    expect(r.ok).toBe(false);
  });

  it("lehnt ein deaktiviertes, aber freigegebenes Konto ab", async () => {
    const ks = await prisma.kostenstelle.findUnique({ where: { id: ksA }, select: { bereichId: true } });
    const inaktiv = await prisma.konto.create({ data: { nummer: "61000", bezeichnung: "Inaktiv", aktiv: false } });
    await prisma.bereichKonto.create({ data: { bereichId: ks!.bereichId, kontoId: inaktiv.id } });
    const r = await pruefeKontenFreigabe(ksA, [inaktiv.id]);
    expect(r.ok).toBe(false);
  });
});
