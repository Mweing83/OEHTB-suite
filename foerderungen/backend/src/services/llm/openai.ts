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
// OpenAI-Provider ueber die Responses-API mit web_search-Tool.
// Gleiche Prompts wie der Anthropic-Provider, anderes Transportformat.
// ---------------------------------------------------------------------------

const OPENAI_URL = "https://api.openai.com/v1/responses";
const STANDARD_MODELL = "gpt-4.1";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private apiKey: string;
  private modell: string;

  constructor(apiKey: string, modell?: string) {
    this.apiKey = apiKey;
    this.modell = modell && modell.trim() ? modell.trim() : STANDARD_MODELL;
  }

  private async frage(system: string, frage: string): Promise<string> {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modell,
        max_output_tokens: 4000,
        tools: [{ type: "web_search" }],
        instructions: system,
        input: frage,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAI-API-Fehler ${res.status}: ${text.slice(0, 300)}`);
    }
    const daten = (await res.json()) as {
      output?: Array<{
        type: string;
        content?: Array<{ type: string; text?: string }>;
      }>;
    };
    const texte: string[] = [];
    for (const block of daten.output ?? []) {
      if (block.type === "message") {
        for (const c of block.content ?? []) {
          if (c.type === "output_text" && c.text) texte.push(c.text);
        }
      }
    }
    if (texte.length === 0) throw new Error("OpenAI-Antwort ohne Text.");
    return texte.join("\n");
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
      `Quellen. Leeres Array [] wenn nichts Neues.`;
    const text = await this.frage(
      system,
      `Bereits bekannte Foerderquellen (NICHT erneut vorschlagen):\n` +
        bekannteNamen.map((n) => `- ${n}`).join("\n")
    );
    return extrahiereJsonArray<QuellenFund>(text);
  }
}
