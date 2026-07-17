import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/prisma";
import { resetDb } from "../test/helfer";
import { fuehreScanAus } from "./scanner";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("fuehreScanAus (Dummy-Provider)", () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.foerderquelle.create({
      data: { name: "FSW", traeger: "Fonds Soziales Wien", ebene: "LAND", kategorie: "KERNGESCHAEFT" },
    });
  });

  it("legt Funde als VORGESCHLAGEN an und protokolliert den Lauf", async () => {
    await fuehreScanAus("MANUELL");

    const vorschlaege = await prisma.ausschreibung.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(vorschlaege).toHaveLength(1);
    expect(vorschlaege[0].quelleTyp).toBe("SCAN");

    const quellenVorschlaege = await prisma.foerderquelle.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(quellenVorschlaege).toHaveLength(1);
    expect(quellenVorschlaege[0].name).toBe("Beispiel-Stiftung (Dummy)");

    const laeufe = await prisma.scanLauf.findMany();
    expect(laeufe).toHaveLength(1);
    expect(laeufe[0].beendet).not.toBeNull();
    expect(laeufe[0].fehler).toBeNull();
  });

  it("schlaegt denselben Fund beim zweiten Lauf nicht erneut vor", async () => {
    await fuehreScanAus("MANUELL");
    await fuehreScanAus("MANUELL");
    const vorschlaege = await prisma.ausschreibung.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(vorschlaege).toHaveLength(1);
  });

  it("schlaegt Abgelehntes nicht erneut vor", async () => {
    await fuehreScanAus("MANUELL");
    await prisma.ausschreibung.updateMany({
      where: { status: "VORGESCHLAGEN" },
      data: { status: "ABGELEHNT" },
    });
    await fuehreScanAus("MANUELL");
    const vorschlaege = await prisma.ausschreibung.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(vorschlaege).toHaveLength(0);
  });
});
