import { LLMProvider, ParseErgebnis, systemAnweisung } from "./typen";
import { jsonAuswerten } from "./anthropic";
import { ollamaBasisUrl } from "../../lib/ollamaEndpoint";

const TIMEOUT_MS = 120_000;

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
  private endpoint: string | null;
  private modell: string;
  private vollzeitStunden?: number;

  constructor(endpoint?: string, modell?: string, vollzeitStunden?: number) {
    // Endpoint kann mit oder ohne abschliessendem "/" gespeichert sein.
    // Gleiche Pruefung wie beim Speichern (Altbestand koennte ungueltig sein).
    this.endpoint = ollamaBasisUrl((endpoint && endpoint.trim()) || STANDARD_ENDPOINT);
    this.modell = (modell && modell.trim()) || STANDARD_MODELL;
    this.vollzeitStunden = vollzeitStunden;
  }

  async parseAenderung(pseudonymisierterText: string): Promise<ParseErgebnis> {
    if (!this.endpoint) {
      throw new Error("Ollama-Endpoint ist ungültig. Bitte in der Administration korrigieren.");
    }
    let res: Response;
    try {
      res = await fetch(`${this.endpoint}/api/chat`, {
        method: "POST",
        // Keine Weiterleitungen folgen, nicht endlos warten (Security-Audit 2026-10).
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
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
      // Details nur ins Server-Log; die Meldung landet sichtbar fuer alle
      // Rollen in der Anfrage und enthaelt daher weder URL noch Fehlertext.
      console.error("Ollama nicht erreichbar:", this.endpoint, err);
      // cause nur fuer Server-Logs/Debugging; gespeichert wird allein message.
      throw new Error(
        "Ollama nicht erreichbar. Läuft der Ollama-Dienst und ist die Endpoint-URL in der Administration korrekt?",
        { cause: err }
      );
    }

    if (!res.ok) {
      const fehlertext = await res.text().catch(() => "");
      console.error(`Ollama-API-Fehler ${res.status}:`, fehlertext.slice(0, 1000));
      throw new Error(`Ollama-API-Fehler (HTTP ${res.status}). Details im Server-Log.`);
    }

    const daten = (await res.json()) as {
      message?: { role: string; content?: string };
    };

    const text = (daten.message?.content ?? "").trim();
    return jsonAuswerten(text);
  }
}
