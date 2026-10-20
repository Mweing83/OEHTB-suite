import { prisma } from "../../lib/prisma";
import { entschluesseln } from "../../lib/krypto";
import { LLM_SCHLUESSEL } from "../../lib/konstanten";
import { LLMProvider, ProviderKonfig } from "./typen";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { DummyProvider } from "./dummy";

// Provider-Factory nach dem Stunden-Muster: liest die gespeicherte
// Konfiguration und faellt ohne gueltigen API-Key auf den Dummy zurueck.

const STANDARD: ProviderKonfig = { provider: "dummy" };

export async function ladeProviderKonfig(): Promise<ProviderKonfig> {
  const eintrag = await prisma.einstellung.findUnique({
    where: { schluessel: LLM_SCHLUESSEL },
  });
  if (!eintrag) return STANDARD;
  const wert = eintrag.wert as Record<string, unknown>;
  const konfig: ProviderKonfig = {
    provider: (wert.provider as ProviderKonfig["provider"]) ?? "dummy",
    modell: typeof wert.modell === "string" ? wert.modell : undefined,
  };
  // Key nur fuer den Anbieter verwenden, fuer den er eingegeben wurde
  // (Altbestand ohne apiKeyProvider: gilt fuer den eingestellten Anbieter).
  const keyAnbieter = (wert.apiKeyProvider as string | undefined) ?? konfig.provider;
  if (
    typeof wert.apiKeyVerschluesselt === "string" &&
    wert.apiKeyVerschluesselt &&
    keyAnbieter === konfig.provider
  ) {
    try {
      konfig.apiKey = entschluesseln(wert.apiKeyVerschluesselt);
    } catch {
      konfig.apiKey = undefined;
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
