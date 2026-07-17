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

  it("erzeugt einen Aktualisierungsvorschlag, wenn sich die Frist einer offenen Ausschreibung aendert", async () => {
    await fuehreScanAus("MANUELL");
    const erster = await prisma.ausschreibung.findFirstOrThrow({ where: { status: "VORGESCHLAGEN" } });

    const inZehnTagen = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await prisma.ausschreibung.update({
      where: { id: erster.id },
      data: { status: "OFFEN", frist: new Date(inZehnTagen + "T00:00:00.000Z") },
    });

    await fuehreScanAus("MANUELL");

    const vorschlaege = await prisma.ausschreibung.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(vorschlaege).toHaveLength(1);
    expect(vorschlaege[0].aktualisiertAusschreibungId).toBe(erster.id);
    expect(vorschlaege[0].foerderquelleId).toBe(erster.foerderquelleId);
  });

  it("legt bei bereits wartendem Aktualisierungsvorschlag keinen zweiten an", async () => {
    await fuehreScanAus("MANUELL");
    const erster = await prisma.ausschreibung.findFirstOrThrow({ where: { status: "VORGESCHLAGEN" } });

    const inZehnTagen = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await prisma.ausschreibung.update({
      where: { id: erster.id },
      data: { status: "OFFEN", frist: new Date(inZehnTagen + "T00:00:00.000Z") },
    });

    await fuehreScanAus("MANUELL");
    await fuehreScanAus("MANUELL");

    const wartend = await prisma.ausschreibung.findMany({
      where: { aktualisiertAusschreibungId: { not: null } },
    });
    expect(wartend).toHaveLength(1);
  });

  it("schlaegt eine archivierte Quelle nicht erneut vor (Tombstone)", async () => {
    await fuehreScanAus("MANUELL");
    await prisma.foerderquelle.updateMany({
      where: { name: "Beispiel-Stiftung (Dummy)" },
      data: { status: "ARCHIVIERT" },
    });

    await fuehreScanAus("MANUELL");

    const quellen = await prisma.foerderquelle.findMany({ where: { name: "Beispiel-Stiftung (Dummy)" } });
    expect(quellen).toHaveLength(1);
  });
});
