import { LLMProvider, ParseErgebnis, systemAnweisung } from "./typen";
import { jsonAuswerten } from "./anthropic";

// ---------------------------------------------------------------------------
// Ollama-Provider (lokales Modell, z. B. llama3.1 / mistral).
// Ruft die Chat-API eines lokal laufenden Ollama-Servers per fetch auf.
//
// VORTEIL (GDPR): Laeuft komplett lokal/on-premise – es verlaesst KEIN Text
// das Haus. Trotzdem bekommt das Modell nur den bereits pseudonymisierten
// Text; hier duerfen keine Klarnamen ankommen.
//
// Doku: https://github.com/ollama/ollama/blob/main/docs/api.md (Endpoint /api/chat)
// ---------------------------------------------------------------------------

const STANDARD_ENDPOINT = "http://localhost:11434";
const STANDARD_MODELL = "llama3.1";

export class OllamaProvider implements LLMProvider {
  name = "ollama";
  private endpoint: string;
  private modell: string;
  private vollzeitStunden?: number;

  constructor(endpoint?: string, modell?: string, vollzeitStunden?: number) {
    // Endpoint kann mit oder ohne abschliessendem "/" gespeichert sein.
    const basis = (endpoint && endpoint.trim()) || STANDARD_ENDPOINT;
    this.endpoint = basis.replace(/\/+$/, "");
    this.modell = (modell && modell.trim()) || STANDARD_MODELL;
    this.vollzeitStunden = vollzeitStunden;
  }

  async parseAenderung(pseudonymisierterText: string): Promise<ParseErgebnis> {
    let res: Response;
    try {
      res = await fetch(`${this.endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.modell,
          // Keine gestreamte Antwort – wir wollen ein vollstaendiges JSON.
          stream: false,
          // Erzwingt gueltiges JSON als Ausgabe (Ollama-Feature).
          format: "json",
          options: {
            // Deterministisch und knapp halten – wir wollen reine Extraktion.
            temperature: 0,
            num_predict: 700,
          },
          messages: [
            // Prompt bei JEDEM Aufruf frisch erzeugen, damit das aktuelle
            // Datum (fuer "kommender Monat" etc.) stimmt.
            { role: "system", content: systemAnweisung(this.vollzeitStunden) },
            { role: "user", content: pseudonymisierterText },
          ],
        }),
      });
    } catch (err) {
      // Typischer Fall: Ollama laeuft nicht / Endpoint falsch.
      const grund = err instanceof Error ? err.message : "unbekannt";
      throw new Error(
        `Ollama nicht erreichbar unter ${this.endpoint} (${grund}). ` +
          `Laeuft der Ollama-Dienst und ist die Endpoint-URL korrekt?`
      );
    }

    if (!res.ok) {
      const fehlertext = await res.text();
      throw new Error(
        `Ollama-API-Fehler (${res.status}): ${fehlertext.slice(0, 300)}`
      );
    }

    const daten = (await res.json()) as {
      message?: { role: string; content?: string };
    };

    const text = (daten.message?.content ?? "").trim();
    return jsonAuswerten(text);
  }
}
