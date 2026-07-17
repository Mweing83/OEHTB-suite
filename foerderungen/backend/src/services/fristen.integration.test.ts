import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/prisma";
import { resetDb } from "../test/helfer";
import { markiereAbgelaufene } from "./fristen";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("markiereAbgelaufene", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("setzt nur OFFENE mit vergangener Frist auf ABGELAUFEN", async () => {
    const q = await prisma.foerderquelle.create({
      data: { name: "Q", traeger: "T", ebene: "BUND", kategorie: "PROJEKT" },
    });
    const gestern = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.ausschreibung.createMany({
      data: [
        { foerderquelleId: q.id, titel: "alt-offen", frist: gestern, status: "OFFEN" },
        { foerderquelleId: q.id, titel: "frisch", frist: morgen, status: "OFFEN" },
        { foerderquelleId: q.id, titel: "laufend", laufendEinreichbar: true, status: "OFFEN" },
        { foerderquelleId: q.id, titel: "alt-vorschlag", frist: gestern, status: "VORGESCHLAGEN" },
      ],
    });

    const anzahl = await markiereAbgelaufene();
    expect(anzahl).toBe(1);

    const abgelaufen = await prisma.ausschreibung.findMany({ where: { status: "ABGELAUFEN" } });
    expect(abgelaufen).toHaveLength(1);
    expect(abgelaufen[0].titel).toBe("alt-offen");
  });
});
