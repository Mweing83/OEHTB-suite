import { FormEvent, useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";

// Einstellungen nach dem Muster des Stunden-Admin-Tabs: LLM-Provider, Modell
// und API-Key (nur "gesetzt/nicht gesetzt" sichtbar, nie der Klartext) sowie
// der Scan-Zeitplan (Wochentag + Stunde, an/aus).
interface Einstellungen {
  llm: { provider: "anthropic" | "openai" | "dummy"; modell: string; apiKeyGesetzt: boolean };
  scan: { aktiv: boolean; wochentag: number; stunde: number };
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

// Auswahlliste der gaengigen Modelle je Anbieter. Erster Eintrag = Standard
// des Backends (leerer Wert). "Eigenes Modell" erlaubt weiterhin Freitext,
// damit neue Modell-IDs ohne Code-Aenderung nutzbar bleiben.
const MODELLE: Record<"anthropic" | "openai", { wert: string; label: string }[]> = {
  anthropic: [
    { wert: "", label: "claude-sonnet-4-6 (Standard)" },
    { wert: "claude-opus-4-8", label: "claude-opus-4-8" },
    { wert: "claude-haiku-4-5", label: "claude-haiku-4-5" },
  ],
  openai: [
    { wert: "", label: "gpt-4.1 (Standard)" },
    { wert: "gpt-5", label: "gpt-5" },
    { wert: "gpt-5-mini", label: "gpt-5-mini" },
    { wert: "gpt-4o", label: "gpt-4o" },
  ],
};

const EIGENES = "__eigenes__";

export default function EinstellungenSeite() {
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const [provider, setProvider] = useState<Einstellungen["llm"]["provider"]>("dummy");
  const [modell, setModell] = useState("");
  // Freitext-Modus, wenn ein gespeichertes Modell nicht in der Liste steht
  // oder bewusst "Eigenes Modell" gewaehlt wurde.
  const [eigenesModell, setEigenesModell] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyGesetzt, setApiKeyGesetzt] = useState(false);

  const [scanAktiv, setScanAktiv] = useState(false);
  const [wochentag, setWochentag] = useState(1);
  const [stunde, setStunde] = useState(6);

  useEffect(() => {
    api
      .get<Einstellungen>("/api/einstellungen")
      .then((d) => {
        setProvider(d.llm.provider);
        setModell(d.llm.modell);
        // Gespeichertes Modell nicht in der Auswahlliste? -> Freitext anzeigen.
        setEigenesModell(
          d.llm.modell !== "" &&
            d.llm.provider !== "dummy" &&
            !MODELLE[d.llm.provider].some((m) => m.wert === d.llm.modell)
        );
        setApiKeyGesetzt(d.llm.apiKeyGesetzt);
        setScanAktiv(d.scan.aktiv);
        setWochentag(d.scan.wochentag);
        setStunde(d.scan.stunde);
      })
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }, []);

  async function llmSpeichern(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setMeldung(null);
    try {
      await api.put("/api/einstellungen/llm", {
        provider,
        modell: modell || undefined,
        apiKey: apiKey || undefined,
      });
      setApiKey("");
      if (apiKey) setApiKeyGesetzt(true);
      setMeldung("LLM-Einstellungen gespeichert.");
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  async function scanSpeichern(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setMeldung(null);
    try {
      await api.put("/api/einstellungen/scan", { aktiv: scanAktiv, wochentag, stunde });
      setMeldung("Scan-Zeitplan gespeichert.");
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  const eingabeKlasse =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marke-500";

  if (laedt) return <Layout><p className="text-gray-500">Lädt …</p></Layout>;

  return (
    <Layout>
      <h1 className="text-xl font-semibold text-gray-800 mb-6">Einstellungen</h1>
      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}
      {meldung && <p className="text-erfolg-700 mb-4">{meldung}</p>}

      <form onSubmit={llmSpeichern} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 max-w-xl">
        <h2 className="text-base font-semibold text-gray-800 mb-1">KI-Anbieter (Scanner)</h2>
        <p className="text-sm text-gray-500 mb-4">
          Der Scanner braucht einen Anbieter mit Websuche (Anthropic oder OpenAI).
          „Attrappe" liefert Beispieldaten zum Testen ohne API-Key.
        </p>
        <div className="grid gap-3">
          <label className="text-sm text-gray-700">
            Anbieter
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as Einstellungen["llm"]["provider"]);
                // Beim Anbieterwechsel auf den Standard des neuen Anbieters
                // zuruecksetzen (Modell-IDs sind nicht uebertragbar).
                setModell("");
                setEigenesModell(false);
              }}
              className={eingabeKlasse + " mt-1"}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="dummy">Attrappe (ohne API-Key)</option>
            </select>
          </label>
          {provider !== "dummy" && (
            <label className="text-sm text-gray-700">
              Modell
              <select
                value={eigenesModell ? EIGENES : modell}
                onChange={(e) => {
                  if (e.target.value === EIGENES) {
                    setEigenesModell(true);
                    setModell("");
                  } else {
                    setEigenesModell(false);
                    setModell(e.target.value);
                  }
                }}
                className={eingabeKlasse + " mt-1"}
              >
                {MODELLE[provider].map((m) => (
                  <option key={m.label} value={m.wert}>{m.label}</option>
                ))}
                <option value={EIGENES}>Eigenes Modell …</option>
              </select>
            </label>
          )}
          {provider !== "dummy" && eigenesModell && (
            <label className="text-sm text-gray-700">
              Eigene Modell-ID
              <input
                value={modell}
                onChange={(e) => setModell(e.target.value)}
                placeholder={provider === "openai" ? "z. B. gpt-5.2" : "z. B. claude-fable-5"}
                className={eingabeKlasse + " mt-1"}
              />
            </label>
          )}
          <label className="text-sm text-gray-700">
            API-Key {apiKeyGesetzt && <span className="text-erfolg-700">(gesetzt – leer lassen zum Behalten)</span>}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyGesetzt ? "••••••••" : "API-Key eingeben"}
              className={eingabeKlasse + " mt-1"}
              autoComplete="off"
            />
          </label>
        </div>
        <button type="submit" className="mt-4 rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700">
          Speichern
        </button>
      </form>

      <form onSubmit={scanSpeichern} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 max-w-xl">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Automatischer Scan</h2>
        <p className="text-sm text-gray-500 mb-4">
          Durchsucht die Förderlandschaft regelmäßig nach neuen Ausschreibungen
          und Quellen. Funde landen zur Prüfung in der Warteschlange.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
          <input type="checkbox" checked={scanAktiv} onChange={(e) => setScanAktiv(e.target.checked)} />
          Automatischen Scan aktivieren
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-gray-700">
            Wochentag
            <select value={wochentag} onChange={(e) => setWochentag(Number(e.target.value))} className={eingabeKlasse + " mt-1"} disabled={!scanAktiv}>
              {WOCHENTAGE.map((w, i) => (
                <option key={i} value={i}>{w}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700">
            Uhrzeit
            <select value={stunde} onChange={(e) => setStunde(Number(e.target.value))} className={eingabeKlasse + " mt-1"} disabled={!scanAktiv}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="mt-4 rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700">
          Speichern
        </button>
      </form>
    </Layout>
  );
}
