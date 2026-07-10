import { LLMProvider, ParseErgebnis, systemAnweisung } from "./typen";
import { jsonAuswerten } from "./anthropic";

// ---------------------------------------------------------------------------
// OpenAI-Provider (GPT).
// Ruft die Chat-Completions-API direkt per fetch auf (kein SDK noetig).
//
// WICHTIG (GDPR): Der uebergebene Text ist bereits pseudonymisiert.
// Hier duerfen keine Klarnamen ankommen. Cloud-Nutzung erfordert AVV + EU-Region.
//
// Doku: https://platform.openai.com/docs/api-reference/chat/create
// ---------------------------------------------------------------------------

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private apiKey: string;
  private modell: string;
  private vollzeitStunden?: number;

  constructor(apiKey: string, modell?: string, vollzeitStunden?: number) {
    this.apiKey = apiKey;
    this.modell = modell ?? "gpt-4o";
    this.vollzeitStunden = vollzeitStunden;
  }

  async parseAenderung(pseudonymisierterText: string): Promise<ParseErgebnis> {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modell,
        // Deterministisch halten – reine Extraktion, keine Kreativitaet.
        temperature: 0,
        max_tokens: 700,
        // Erzwingt ein gueltiges JSON-Objekt als Antwort.
        response_format: { type: "json_object" },
        messages: [
          // Prompt bei JEDEM Aufruf frisch erzeugen, damit das aktuelle Datum
          // (fuer "kommender Monat" etc.) stimmt.
          { role: "system", content: systemAnweisung(this.vollzeitStunden) },
          { role: "user", content: pseudonymisierterText },
        ],
      }),
    });

    if (!res.ok) {
      const fehlertext = await res.text();
      throw new Error(
        `OpenAI-API-Fehler (${res.status}): ${fehlertext.slice(0, 300)}`
      );
    }

    const daten = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const text = (daten.choices?.[0]?.message?.content ?? "").trim();
    return jsonAuswerten(text);
  }
}
