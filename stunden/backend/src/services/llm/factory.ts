import { prisma } from "../../lib/prisma";
import { entschluesseln } from "../../lib/krypto";
import { LLMProvider, ProviderKonfig, VOLLZEIT_STUNDEN } from "./typen";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { OllamaProvider } from "./ollama";
import { DummyProvider } from "./dummy";

// ---------------------------------------------------------------------------
// Provider-Factory.
// Liest die aktive Konfiguration aus den Admin-Einstellungen und liefert die
// passende Provider-Implementierung. Faellt auf den Dummy zurueck, wenn keine
// gueltige Konfiguration vorhanden ist (z. B. fehlender API-Key).
// ---------------------------------------------------------------------------

const EINSTELLUNG_SCHLUESSEL = "llm_konfig";
// Schluessel der Einstellung fuer die Referenz-Wochenstunden (= 100 %).
export const VOLLZEIT_SCHLUESSEL = "vollzeit_konfig";

// Standardkonfiguration, falls noch nichts gespeichert wurde.
const STANDARD: ProviderKonfig = {
  provider: "dummy",
};

// Liest die im Admin-Tab konfigurierten Referenz-Wochenstunden (= 100 %).
// Faellt auf den Standardwert zurueck, wenn nichts (Gueltiges) gespeichert ist.
export async function ladeVollzeitStunden(): Promise<number> {
  const eintrag = await prisma.einstellung.findUnique({
    where: { schluessel: VOLLZEIT_SCHLUESSEL },
  });
  if (!eintrag) return VOLLZEIT_STUNDEN;
  const wert = eintrag.wert as Record<string, unknown>;
  const stunden = wert.vollzeitStunden;
  return typeof stunden === "number" && stunden > 0
    ? stunden
    : VOLLZEIT_STUNDEN;
}

// Liest die gespeicherte LLM-Konfiguration (mit entschluesseltem API-Key).
export async function ladeProviderKonfig(): Promise<ProviderKonfig> {
  const eintrag = await prisma.einstellung.findUnique({
    where: { schluessel: EINSTELLUNG_SCHLUESSEL },
  });
  if (!eintrag) return STANDARD;

  const wert = eintrag.wert as Record<string, unknown>;
  const konfig: ProviderKonfig = {
    provider: (wert.provider as ProviderKonfig["provider"]) ?? "dummy",
    modell: typeof wert.modell === "string" ? wert.modell : undefined,
    endpoint: typeof wert.endpoint === "string" ? wert.endpoint : undefined,
  };

  // API-Key ist verschluesselt gespeichert.
  if (typeof wert.apiKeyVerschluesselt === "string" && wert.apiKeyVerschluesselt) {
    try {
      konfig.apiKey = entschluesseln(wert.apiKeyVerschluesselt);
    } catch {
      konfig.apiKey = undefined;
    }
  }

  return konfig;
}

// Erzeugt den Provider gemaess Konfiguration. Die Referenz-Wochenstunden
// (= 100 %) fliessen in den System-Prompt ein (Stunden <-> Prozent).
export function erzeugeProvider(
  konfig: ProviderKonfig,
  vollzeitStunden: number = VOLLZEIT_STUNDEN
): LLMProvider {
  switch (konfig.provider) {
    case "anthropic":
      if (!konfig.apiKey) {
        // Ohne Key kein Cloud-Call – sicherer Rueckfall auf Attrappe.
        return new DummyProvider();
      }
      return new AnthropicProvider(konfig.apiKey, konfig.modell, vollzeitStunden);

    case "openai":
      if (!konfig.apiKey) {
        // Ohne Key kein Cloud-Call – sicherer Rueckfall auf Attrappe.
        return new DummyProvider();
      }
      return new OpenAIProvider(konfig.apiKey, konfig.modell, vollzeitStunden);

    case "ollama":
      // Ollama braucht keinen API-Key – nur Endpoint (optional) und Modell.
      // Faellt im Provider selbst auf localhost:11434 / llama3.1 zurueck.
      return new OllamaProvider(konfig.endpoint, konfig.modell, vollzeitStunden);

    case "dummy":
    default:
      return new DummyProvider();
  }
}

// Bequemer Einzelaufruf: Konfig + Referenz-Stunden laden, Provider bauen.
export async function aktiverProvider(): Promise<LLMProvider> {
  const [konfig, vollzeitStunden] = await Promise.all([
    ladeProviderKonfig(),
    ladeVollzeitStunden(),
  ]);
  return erzeugeProvider(konfig, vollzeitStunden);
}
