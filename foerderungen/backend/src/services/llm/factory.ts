import { prisma } from "../../lib/prisma";
import { entschluesseln } from "../../lib/krypto";
import { LLM_SCHLUESSEL } from "../../lib/konstanten";
import { LLMProvider, ProviderKonfig } from "./typen";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { DummyProvider } from "./dummy";

// Provider-Factory nach dem Stunden-Muster: liest die gespeicherte
// Konfiguration und faellt OHNE hinterlegten API-Key auf den Dummy zurueck.
// Ein hinterlegter, aber unlesbarer Key ist dagegen ein Fehler (siehe unten).

// Gespeicherte LLM-Konfiguration (Einstellung "llm_konfig"), einheitlich
// gelesen – von den Einstellungs-Routen und der Factory.
export interface GespeicherteLlmKonfig {
  provider: ProviderKonfig["provider"];
  modell: string;
  apiKeyVerschluesselt: string | null;
  // Fuer welchen Anbieter der Key eingegeben wurde; null ohne Key. Ein Key
  // gehoert zu genau einem Anbieter (Altbestand ohne apiKeyProvider: gilt
  // fuer den eingestellten Anbieter).
  apiKeyAnbieter: string | null;
}

export async function ladeGespeicherteLlmKonfig(): Promise<GespeicherteLlmKonfig> {
  const eintrag = await prisma.einstellung.findUnique({
    where: { schluessel: LLM_SCHLUESSEL },
  });
  const wert = (eintrag?.wert as Record<string, unknown> | undefined) ?? {};
  const provider = (wert.provider as ProviderKonfig["provider"] | undefined) ?? "dummy";
  const key =
    typeof wert.apiKeyVerschluesselt === "string" && wert.apiKeyVerschluesselt ? wert.apiKeyVerschluesselt : null;
  return {
    provider,
    modell: typeof wert.modell === "string" ? wert.modell : "",
    apiKeyVerschluesselt: key,
    apiKeyAnbieter: key ? ((wert.apiKeyProvider as string | undefined) ?? provider) : null,
  };
}

export async function ladeProviderKonfig(): Promise<ProviderKonfig> {
  const gespeichert = await ladeGespeicherteLlmKonfig();
  const konfig: ProviderKonfig = {
    provider: gespeichert.provider,
    modell: gespeichert.modell || undefined,
  };
  // Key nur fuer den Anbieter verwenden, fuer den er eingegeben wurde.
  if (gespeichert.apiKeyVerschluesselt && gespeichert.apiKeyAnbieter === konfig.provider) {
    try {
      konfig.apiKey = entschluesseln(gespeichert.apiKeyVerschluesselt);
    } catch (err) {
      // Ein gespeicherter, aber nicht mehr entschluesselbarer Key (z. B. nach
      // geaendertem Schluessel-Geheimnis) darf NICHT still zum Dummy-Anbieter
      // fuehren: der schriebe Beispiel-Funde in die echte Datenbank. Der Scan
      // bricht stattdessen mit dieser Meldung ab (steht im Scan-Protokoll).
      throw new Error(
        "Der gespeicherte API-Schlüssel lässt sich nicht entschlüsseln. Bitte in den Einstellungen neu eingeben.",
        { cause: err }
      );
    }
  }
  return konfig;
}

export function erzeugeProvider(konfig: ProviderKonfig): LLMProvider {
  switch (konfig.provider) {
    case "anthropic":
      if (!konfig.apiKey) return new DummyProvider();
      return new AnthropicProvider(konfig.apiKey, konfig.modell);
    case "openai":
      if (!konfig.apiKey) return new DummyProvider();
      return new OpenAIProvider(konfig.apiKey, konfig.modell);
    default:
      return new DummyProvider();
  }
}
