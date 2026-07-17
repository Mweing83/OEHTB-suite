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

  it("Ueberwachung legt Ausschreibungs-Funde als VORGESCHLAGEN an und protokolliert den Lauf", async () => {
    await fuehreScanAus("MANUELL", "UEBERWACHUNG");

    const vorschlaege = await prisma.ausschreibung.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(vorschlaege).toHaveLength(1);
    expect(vorschlaege[0].quelleTyp).toBe("SCAN");

    // Ueberwachung schlaegt KEINE neuen Quellen vor (getrennte Scan-Art).
    const quellenVorschlaege = await prisma.foerderquelle.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(quellenVorschlaege).toHaveLength(0);

    const laeufe = await prisma.scanLauf.findMany();
    expect(laeufe).toHaveLength(1);
    expect(laeufe[0].art).toBe("UEBERWACHUNG");
    expect(laeufe[0].beendet).not.toBeNull();
    expect(laeufe[0].fehler).toBeNull();
  });

  it("Entdeckung legt Quellen-Funde als VORGESCHLAGEN an, aber keine Ausschreibungen", async () => {
    await fuehreScanAus("MANUELL", "ENTDECKUNG");

    const quellenVorschlaege = await prisma.foerderquelle.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(quellenVorschlaege).toHaveLength(1);
    expect(quellenVorschlaege[0].name).toBe("Beispiel-Stiftung (Dummy)");

    const ausschreibungen = await prisma.ausschreibung.findMany();
    expect(ausschreibungen).toHaveLength(0);

    const laeufe = await prisma.scanLauf.findMany();
    expect(laeufe).toHaveLength(1);
    expect(laeufe[0].art).toBe("ENTDECKUNG");
  });

  it("schlaegt denselben Fund beim zweiten Lauf nicht erneut vor", async () => {
    await fuehreScanAus("MANUELL", "UEBERWACHUNG");
    await fuehreScanAus("MANUELL", "UEBERWACHUNG");
    const vorschlaege = await prisma.ausschreibung.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(vorschlaege).toHaveLength(1);
  });

  it("schlaegt Abgelehntes nicht erneut vor", async () => {
    await fuehreScanAus("MANUELL", "UEBERWACHUNG");
    await prisma.ausschreibung.updateMany({
      where: { status: "VORGESCHLAGEN" },
      data: { status: "ABGELEHNT" },
    });
    await fuehreScanAus("MANUELL", "UEBERWACHUNG");
    const vorschlaege = await prisma.ausschreibung.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(vorschlaege).toHaveLength(0);
  });

  it("erzeugt einen Aktualisierungsvorschlag, wenn sich die Frist einer offenen Ausschreibung aendert", async () => {
    await fuehreScanAus("MANUELL", "UEBERWACHUNG");
    const erster = await prisma.ausschreibung.findFirstOrThrow({ where: { status: "VORGESCHLAGEN" } });

    const inZehnTagen = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await prisma.ausschreibung.update({
      where: { id: erster.id },
      data: { status: "OFFEN", frist: new Date(inZehnTagen + "T00:00:00.000Z") },
    });

    await fuehreScanAus("MANUELL", "UEBERWACHUNG");

    const vorschlaege = await prisma.ausschreibung.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(vorschlaege).toHaveLength(1);
    expect(vorschlaege[0].aktualisiertAusschreibungId).toBe(erster.id);
    expect(vorschlaege[0].foerderquelleId).toBe(erster.foerderquelleId);
  });

  it("legt bei bereits wartendem Aktualisierungsvorschlag keinen zweiten an", async () => {
    await fuehreScanAus("MANUELL", "UEBERWACHUNG");
    const erster = await prisma.ausschreibung.findFirstOrThrow({ where: { status: "VORGESCHLAGEN" } });

    const inZehnTagen = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await prisma.ausschreibung.update({
      where: { id: erster.id },
      data: { status: "OFFEN", frist: new Date(inZehnTagen + "T00:00:00.000Z") },
    });

    await fuehreScanAus("MANUELL", "UEBERWACHUNG");
    await fuehreScanAus("MANUELL", "UEBERWACHUNG");

    const wartend = await prisma.ausschreibung.findMany({
      where: { aktualisiertAusschreibungId: { not: null } },
    });
    expect(wartend).toHaveLength(1);
  });

  it("schlaegt einen abgelehnten Aktualisierungsvorschlag nicht erneut vor", async () => {
    const quelle = await prisma.foerderquelle.findFirstOrThrow({ where: { name: "FSW" } });
    // Frist bewusst ungleich dem Dummy-Fund (heute+30 Tage), damit der erste
    // Scan einen Aktualisierungsvorschlag erzeugt.
    const inZehnTagen = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await prisma.ausschreibung.create({
      data: {
        foerderquelleId: quelle.id,
        titel: "Bestehende FSW-Ausschreibung",
        beschreibung: "",
        link: "https://beispiel.at/dummy-call",
        linkNormalisiert: "beispiel.at/dummy-call",
        frist: new Date(inZehnTagen + "T00:00:00.000Z"),
        status: "OFFEN",
        quelleTyp: "SCAN",
      },
    });

    await fuehreScanAus("MANUELL", "UEBERWACHUNG");
    const aktualisierung = await prisma.ausschreibung.findFirstOrThrow({
      where: { aktualisiertAusschreibungId: { not: null }, status: "VORGESCHLAGEN" },
    });

    await prisma.ausschreibung.update({
      where: { id: aktualisierung.id },
      data: { status: "ABGELEHNT" },
    });

    await fuehreScanAus("MANUELL", "UEBERWACHUNG");

    const wartend = await prisma.ausschreibung.count({
      where: { aktualisiertAusschreibungId: { not: null }, status: "VORGESCHLAGEN" },
    });
    expect(wartend).toBe(0);
  });

  it("eine ABGELAUFENE Ausschreibung mit neuer Frist bekommt einen Aktualisierungsvorschlag", async () => {
    const quelle = await prisma.foerderquelle.findFirstOrThrow({ where: { name: "FSW" } });
    const gestern = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const alt = await prisma.ausschreibung.create({
      data: {
        foerderquelleId: quelle.id,
        titel: "Abgelaufene FSW-Ausschreibung",
        beschreibung: "",
        link: "https://beispiel.at/dummy-call",
        linkNormalisiert: "beispiel.at/dummy-call",
        frist: new Date(gestern + "T00:00:00.000Z"),
        status: "ABGELAUFEN",
        quelleTyp: "SCAN",
      },
    });

    await fuehreScanAus("MANUELL", "UEBERWACHUNG");

    const aktualisierung = await prisma.ausschreibung.findFirst({
      where: { aktualisiertAusschreibungId: alt.id, status: "VORGESCHLAGEN" },
    });
    expect(aktualisierung).not.toBeNull();
  });

  it("schlaegt eine archivierte Quelle nicht erneut vor (Tombstone)", async () => {
    await fuehreScanAus("MANUELL", "ENTDECKUNG");
    await prisma.foerderquelle.updateMany({
      where: { name: "Beispiel-Stiftung (Dummy)" },
      data: { status: "ARCHIVIERT" },
    });

    await fuehreScanAus("MANUELL", "ENTDECKUNG");

    const quellen = await prisma.foerderquelle.findMany({ where: { name: "Beispiel-Stiftung (Dummy)" } });
    expect(quellen).toHaveLength(1);
  });
});
