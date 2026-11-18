import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";
import { type Einstellungen } from "./typen";

// Abschnitt: KI-Provider

// Empfohlene Modelle je Anbieter (Dropdown-Vorauswahl). Die Liste ist nur eine
// Hilfe – ueber "Benutzerdefiniert" laesst sich jeder beliebige Modellname
// eintippen (wichtig fuer Ollama, wo man eigene Tags pullt).
const MODELL_VORSCHLAEGE: Record<string, { wert: string; label: string }[]> = {
  anthropic: [
    { wert: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (empfohlen)" },
    { wert: "claude-opus-4-8", label: "Claude Opus 4.8 (stärkste)" },
    { wert: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (schnell/günstig)" },
  ],
  openai: [
    { wert: "gpt-4o", label: "GPT-4o" },
    { wert: "gpt-4o-mini", label: "GPT-4o mini (günstig)" },
  ],
  ollama: [
    { wert: "qwen2.5:7b", label: "Qwen 2.5 7B (empfohlen, mehrsprachig)" },
    { wert: "qwen2.5:14b", label: "Qwen 2.5 14B (genauer, mehr RAM)" },
    { wert: "llama3.1", label: "Llama 3.1 8B" },
    { wert: "gemma2:9b", label: "Gemma 2 9B" },
    { wert: "mistral-nemo", label: "Mistral Nemo 12B" },
    { wert: "phi4", label: "Phi-4 14B" },
  ],
};

// Sentinel-Wert im Dropdown fuer die freie Eingabe.
const MODELL_BENUTZERDEFINIERT = "__custom__";

export default function LlmEinstellungen() {
  const [provider, setProvider] = useState("dummy");
  const [modell, setModell] = useState("");
  // Steht das aktuelle Modell NICHT in der Vorschlagsliste, zeigen wir das
  // freie Texteingabefeld ("Benutzerdefiniert").
  const [benutzerdefiniert, setBenutzerdefiniert] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyGesetzt, setKeyGesetzt] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  const laden = useCallback(() => {
    api.get<Einstellungen>("/api/admin/einstellungen").then((e) => {
      setProvider(e.llm.provider);
      setModell(e.llm.modell);
      setEndpoint(e.llm.endpoint);
      setKeyGesetzt(e.llm.apiKeyGesetzt);
      // Gespeichertes Modell mit der Vorschlagsliste abgleichen.
      const liste = MODELL_VORSCHLAEGE[e.llm.provider] ?? [];
      setBenutzerdefiniert(
        Boolean(e.llm.modell) && !liste.some((m) => m.wert === e.llm.modell)
      );
    });
  }, []);
  useEffect(laden, [laden]);

  // Anbieter wechseln: Modell auf den ersten Vorschlag des neuen Anbieters
  // setzen, damit nie ein zum Anbieter unpassendes Modell stehen bleibt.
  function providerWechseln(neu: string) {
    setProvider(neu);
    const liste = MODELL_VORSCHLAEGE[neu] ?? [];
    setBenutzerdefiniert(false);
    setModell(liste.length > 0 ? liste[0].wert : "");
  }

  async function speichern() {
    setSpeichert(true);
    setMeldung(null);
    try {
      await api.put("/api/admin/llm", {
        provider,
        modell,
        endpoint,
        apiKey, // leer = unveraendert
      });
      setApiKey("");
      setMeldung("Gespeichert.");
      laden();
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setSpeichert(false);
    }
  }

  // Sinnvolle Modell-Vorbelegung je Provider als Hilfe.
  const modellPlatzhalter =
    provider === "anthropic"
      ? "z. B. claude-sonnet-4-6"
      : provider === "openai"
      ? "z. B. gpt-4o"
      : provider === "ollama"
      ? "z. B. llama3.1"
      : "(Attrappe braucht kein Modell)";

  return (
    <div className="bg-white rounded-lg shadow-xs p-6">
      <h3 className="font-semibold text-gray-800 mb-4">KI-Provider</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Anbieter</label>
          <select
            value={provider}
            onChange={(e) => providerWechseln(e.target.value)}
            className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm"
          >
            <option value="dummy">Attrappe (ohne KI, zum Testen)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="ollama">Ollama (lokal, ohne Datenabfluss)</option>
          </select>
        </div>

        {provider !== "dummy" && (
          <div>
            <label className="block text-sm text-gray-700 mb-1">Modell</label>
            <select
              value={benutzerdefiniert ? MODELL_BENUTZERDEFINIERT : modell}
              onChange={(e) => {
                if (e.target.value === MODELL_BENUTZERDEFINIERT) {
                  setBenutzerdefiniert(true);
                  setModell("");
                } else {
                  setBenutzerdefiniert(false);
                  setModell(e.target.value);
                }
              }}
              className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm"
            >
              {(MODELL_VORSCHLAEGE[provider] ?? []).map((m) => (
                <option key={m.wert} value={m.wert}>
                  {m.label}
                </option>
              ))}
              <option value={MODELL_BENUTZERDEFINIERT}>Benutzerdefiniert …</option>
            </select>
            {benutzerdefiniert && (
              <input
                value={modell}
                onChange={(e) => setModell(e.target.value)}
                placeholder={modellPlatzhalter}
                className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm mt-2"
              />
            )}
          </div>
        )}

        {provider === "ollama" && (
          <div className="col-span-2">
            <label className="block text-sm text-gray-700 mb-1">
              Endpoint-URL (Ollama)
            </label>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm"
            />
          </div>
        )}

        {(provider === "anthropic" || provider === "openai") && (
          <div className="col-span-2">
            <label className="block text-sm text-gray-700 mb-1">
              API-Key{" "}
              {keyGesetzt && (
                <span className="text-green-600 text-xs">
                  (gesetzt – leer lassen zum Beibehalten)
                </span>
              )}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keyGesetzt ? "•••••••• (unverändert)" : "API-Key eingeben"}
              className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Der Key wird verschlüsselt gespeichert und nie im Klartext
              zurückgegeben.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={speichern}
          disabled={speichert}
          className="bg-marke-600 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          {speichert ? "Speichern …" : "Speichern"}
        </button>
        {meldung && <span className="text-sm text-gray-600">{meldung}</span>}
      </div>

      {provider === "ollama" && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-sm px-3 py-2 mt-3">
          Ollama läuft lokal – es verlässt kein Text das Haus, kein API-Key
          nötig. Voraussetzung: Der Ollama-Dienst läuft und das angegebene
          Modell ist geladen (z. B. <code>ollama pull llama3.1</code>). Endpoint
          leer lassen für den Standard <code>http://localhost:11434</code>.
        </p>
      )}
    </div>
  );
}
