import { LLMProvider, QuellenInfo, ScanFund, QuellenFund } from "./typen";

// Attrappe: deterministische Beispiel-Funde, damit Entwicklung, Tests und
// UI-Abnahme ohne API-Key funktionieren. Liefert pro Lauf genau einen
// Ausschreibungs-Fund je erster Quelle und einen Quellen-Vorschlag.
export class DummyProvider implements LLMProvider {
  name = "dummy";

  async sucheAusschreibungen(quellen: QuellenInfo[]): Promise<ScanFund[]> {
    if (quellen.length === 0) return [];
    const inDreissigTagen = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const frist = inDreissigTagen.toISOString().slice(0, 10);
    return [
      {
        quelleName: quellen[0].name,
        titel: `Beispiel-Ausschreibung (${quellen[0].name})`,
        link: "https://beispiel.at/dummy-call",
        frist,
        laufendEinreichbar: false,
        foerderhoehe: "bis 10.000 EUR",
        beschreibung:
          "Attrappen-Fund des Dummy-Providers (kein echtes Modell). Dient zum Testen des Pruef-Ablaufs.",
      },
    ];
  }

  async entdeckeQuellen(bekannteNamen: string[]): Promise<QuellenFund[]> {
    if (bekannteNamen.includes("Beispiel-Stiftung (Dummy)")) return [];
    return [
      {
        name: "Beispiel-Stiftung (Dummy)",
        traeger: "Beispiel-Stiftung",
        ebene: "PRIVAT",
        kategorie: "PROJEKT",
        themen: ["Behindertenhilfe"],
        beschreibung:
          "Attrappen-Vorschlag des Dummy-Providers (kein echtes Modell).",
        webseite: "https://beispiel.at/stiftung",
      },
    ];
  }
}
