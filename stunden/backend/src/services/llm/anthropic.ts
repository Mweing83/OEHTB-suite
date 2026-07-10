import { LLMProvider, ParseErgebnis, systemAnweisung } from "./typen";

// ---------------------------------------------------------------------------
// Anthropic-Provider (Claude).
// Ruft die Messages-API direkt per fetch auf (kein SDK noetig).
//
// WICHTIG (GDPR): Der uebergebene Text ist bereits pseudonymisiert.
// Hier duerfen keine Klarnamen ankommen.
// ---------------------------------------------------------------------------

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private apiKey: string;
  private modell: string;
  private vollzeitStunden?: number;

  constructor(apiKey: string, modell?: string, vollzeitStunden?: number) {
    this.apiKey = apiKey;
    this.modell = modell ?? "claude-sonnet-4-6";
    this.vollzeitStunden = vollzeitStunden;
  }

  async parseAenderung(pseudonymisierterText: string): Promise<ParseErgebnis> {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: this.modell,
        max_tokens: 700,
        // Prompt bei JEDEM Aufruf frisch erzeugen, damit das aktuelle Datum
        // (fuer "kommender Monat" etc.) stimmt und nicht beim Serverstart
        // eingefroren wird.
        system: systemAnweisung(this.vollzeitStunden),
        messages: [
          {
            role: "user",
            content: pseudonymisierterText,
          },
        ],
      }),
    });

    if (!res.ok) {
      const fehlertext = await res.text();
      throw new Error(
        `Anthropic-API-Fehler (${res.status}): ${fehlertext.slice(0, 300)}`
      );
    }

    const daten = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };

    // Text aus den content-Bloecken zusammenfuegen.
    const text = (daten.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("")
      .trim();

    return jsonAuswerten(text);
  }
}

// Robustes Auswerten der Modell-Antwort als JSON.
// Entfernt eventuelle Code-Bloecke und sucht das erste JSON-Objekt.
export function jsonAuswerten(text: string): ParseErgebnis {
  let bereinigt = text.replace(/```json|```/g, "").trim();

  // Falls das Modell doch Text drumherum schreibt: erstes {...} herausziehen.
  const start = bereinigt.indexOf("{");
  const ende = bereinigt.lastIndexOf("}");
  if (start !== -1 && ende !== -1 && ende > start) {
    bereinigt = bereinigt.slice(start, ende + 1);
  }

  let roh: Record<string, unknown>;
  try {
    roh = JSON.parse(bereinigt);
  } catch {
    // Wenn gar nichts Parsebares kommt: niedrige Konfidenz, Hinweis setzen.
    return {
      personPlatzhalter: null,
      neuStunden: null,
      altStunden: null,
      ausmassProzent: null,
      gueltigAb: null,
      konfidenz: 0,
      hinweis: "Antwort des Modells konnte nicht als JSON gelesen werden.",
    };
  }

  const zahlOderNull = (w: unknown): number | null =>
    typeof w === "number" && Number.isFinite(w) ? w : null;

  return {
    personPlatzhalter:
      typeof roh.personPlatzhalter === "string" ? roh.personPlatzhalter : null,
    neuStunden: zahlOderNull(roh.neuStunden),
    altStunden: zahlOderNull(roh.altStunden),
    ausmassProzent: zahlOderNull(roh.ausmassProzent),
    gueltigAb: typeof roh.gueltigAb === "string" ? roh.gueltigAb : null,
    konfidenz:
      typeof roh.konfidenz === "number" && Number.isFinite(roh.konfidenz)
        ? Math.max(0, Math.min(1, roh.konfidenz))
        : 0,
    hinweis: typeof roh.hinweis === "string" ? roh.hinweis : null,
  };
}
