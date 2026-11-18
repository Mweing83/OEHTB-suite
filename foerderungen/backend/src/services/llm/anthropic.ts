import { WebsucheProvider } from "./websuche";

// ---------------------------------------------------------------------------
// Anthropic-Provider (Claude) mit providerseitigem Web-Search-Tool.
// Direkter fetch auf die Messages-API, kein SDK (Muster: stunden).
// Kostendeckel: max_tokens + max_uses der Websuche sind fest begrenzt.
// Aufgaben und Prompts kommen aus WebsucheProvider; hier nur der Transport.
// ---------------------------------------------------------------------------

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const STANDARD_MODELL = "claude-sonnet-4-6";

export class AnthropicProvider extends WebsucheProvider {
  name = "anthropic";
  private apiKey: string;
  private modell: string;

  constructor(apiKey: string, modell?: string) {
    super();
    this.apiKey = apiKey;
    this.modell = modell && modell.trim() ? modell.trim() : STANDARD_MODELL;
  }

  protected async frage(system: string, frage: string): Promise<string> {
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
      stop_reason?: string;
    };
    // Abgeschnittene Antworten ergeben unvollstaendiges JSON – klar benennen
    // statt spaeter mit einem kryptischen Parse-Fehler zu scheitern.
    if (daten.stop_reason === "max_tokens") {
      throw new Error(
        "Anthropic-Antwort wurde abgeschnitten (max_tokens erreicht) – Lauf wird wiederholt."
      );
    }
    // Letzter Textblock enthaelt die finale Antwort (davor Tool-Blocks).
    const textBloecke = daten.content.filter((b) => b.type === "text" && b.text);
    if (textBloecke.length === 0) throw new Error("Anthropic-Antwort ohne Text.");
    return textBloecke.map((b) => b.text).join("\n");
  }
}
