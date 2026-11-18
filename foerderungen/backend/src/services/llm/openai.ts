import { WebsucheProvider } from "./websuche";

// ---------------------------------------------------------------------------
// OpenAI-Provider ueber die Responses-API mit web_search-Tool.
// Aufgaben und Prompts kommen aus WebsucheProvider; hier nur der Transport.
// ---------------------------------------------------------------------------

const OPENAI_URL = "https://api.openai.com/v1/responses";
const STANDARD_MODELL = "gpt-4.1";

export class OpenAIProvider extends WebsucheProvider {
  name = "openai";
  private apiKey: string;
  private modell: string;

  constructor(apiKey: string, modell?: string) {
    super();
    this.apiKey = apiKey;
    this.modell = modell && modell.trim() ? modell.trim() : STANDARD_MODELL;
  }

  protected async frage(system: string, frage: string): Promise<string> {
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
}
