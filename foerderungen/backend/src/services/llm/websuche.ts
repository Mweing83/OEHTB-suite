import {
  LLMProvider,
  QuellenInfo,
  ScanFund,
  QuellenFund,
  OEHTB_PROFIL,
  heuteIso,
  extrahiereJsonArray,
} from "./typen";

// ---------------------------------------------------------------------------
// Gemeinsame Basis der Anbieter mit Websuche (Anthropic, OpenAI): Die beiden
// Aufgaben und ihre Prompts sind fuer alle Anbieter gleich – ein Anbieter
// liefert nur noch den Transport (frage) zu seiner API.
// ---------------------------------------------------------------------------

const JSON_STRIKT =
  `Das JSON muss STRIKT gueltig sein: doppelte Anfuehrungszeichen in ` +
  `Texten mit Backslash escapen, keine haengenden Kommas, keine Kommentare.`;

export abstract class WebsucheProvider implements LLMProvider {
  abstract name: string;

  // Schickt System-Anweisung und Frage an die API und liefert den Antworttext.
  protected abstract frage(system: string, frage: string): Promise<string>;

  async sucheAusschreibungen(quellen: QuellenInfo[]): Promise<ScanFund[]> {
    const liste = quellen
      .map((q) => `- ${q.name} (${q.webseite ?? "keine Webseite"}; Themen: ${q.themen.join(", ") || "-"})`)
      .join("\n");
    const system =
      `${OEHTB_PROFIL}\nHeute ist ${heuteIso()}. Du recherchierst per Websuche ` +
      `aktuell offene Foerder-Ausschreibungen (Calls) der genannten Foerdergeber. ` +
      `Antworte AM ENDE ausschliesslich mit einem JSON-Array. Jedes Element: ` +
      `{"quelleName": string (exakt wie in der Liste), "titel": string, ` +
      `"link": string|null, "frist": "YYYY-MM-DD"|null, ` +
      `"laufendEinreichbar": boolean, "foerderhoehe": string|null, ` +
      `"beschreibung": string (1-3 Saetze, deutsch)}. ` +
      `Nur Ausschreibungen mit Frist heute oder spaeter bzw. laufender ` +
      `Einreichung. Keine erfundenen Links. Leeres Array [] wenn nichts gefunden. ` +
      JSON_STRIKT;
    const text = await this.frage(system, `Pruefe diese Foerdergeber auf aktuell offene Ausschreibungen:\n${liste}`);
    return extrahiereJsonArray<ScanFund>(text);
  }

  async entdeckeQuellen(bekannteNamen: string[]): Promise<QuellenFund[]> {
    const system =
      `${OEHTB_PROFIL}\nHeute ist ${heuteIso()}. Du suchst per Websuche nach ` +
      `Foerderquellen (oeffentlich: Bund/Land/Gemeinde/EU, und privat: ` +
      `Stiftungen, Spendenaktionen, Lotteriemittel), die fuer diese ` +
      `Organisation relevant sind und NICHT in der bekannten Liste stehen. ` +
      `Antworte AM ENDE ausschliesslich mit einem JSON-Array. Jedes Element: ` +
      `{"name": string, "traeger": string, ` +
      `"ebene": "BUND"|"LAND"|"GEMEINDE"|"EU"|"PRIVAT", ` +
      `"kategorie": "PROJEKT"|"KERNGESCHAEFT"|"BEIDES", ` +
      `"themen": string[], "beschreibung": string (1-3 Saetze, deutsch), ` +
      `"webseite": string|null}. Maximal 5 Vorschlaege, nur seriös belegbare ` +
      `Quellen. Leeres Array [] wenn nichts Neues. ` +
      JSON_STRIKT;
    const text = await this.frage(
      system,
      `Bereits bekannte Foerderquellen (NICHT erneut vorschlagen):\n` +
        bekannteNamen.map((n) => `- ${n}`).join("\n")
    );
    return extrahiereJsonArray<QuellenFund>(text);
  }
}
