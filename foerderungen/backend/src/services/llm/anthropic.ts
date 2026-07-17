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
// Anthropic-Provider (Claude) mit providerseitigem Web-Search-Tool.
// Direkter fetch auf die Messages-API, kein SDK (Muster: stunden).
// Kostendeckel: max_tokens + max_uses der Websuche sind fest begrenzt.
// ---------------------------------------------------------------------------

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const STANDARD_MODELL = "claude-sonnet-4-6";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private apiKey: string;
  private modell: string;

  constructor(apiKey: string, modell?: string) {
    this.apiKey = apiKey;
    this.modell = modell && modell.trim() ? modell.trim() : STANDARD_MODELL;
  }

  private async frage(system: string, frage: string): Promise<string> {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: this.modell,
        max_tokens: 4000,
        system,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
        messages: [{ role: "user", content: frage }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic-API-Fehler ${res.status}: ${text.slice(0, 300)}`);
    }
    const daten = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    // Letzter Textblock enthaelt die finale Antwort (davor Tool-Blocks).
    const textBloecke = daten.content.filter((b) => b.type === "text" && b.text);
    if (textBloecke.length === 0) throw new Error("Anthropic-Antwort ohne Text.");
    return textBloecke.map((b) => b.text).join("\n");
  }

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
      `Einreichung. Keine erfundenen Links. Leeres Array [] wenn nichts gefunden.`;
    const frage = `Pruefe diese Foerdergeber auf aktuell offene Ausschreibungen:\n${liste}`;
    const text = await this.frage(system, frage);
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
      `Quellen. Leeres Array [] wenn nichts Neues.`;
    const frage =
      `Bereits bekannte Foerderquellen (NICHT erneut vorschlagen):\n` +
      bekannteNamen.map((n) => `- ${n}`).join("\n");
    const text = await this.frage(system, frage);
    return extrahiereJsonArray<QuellenFund>(text);
  }
}
