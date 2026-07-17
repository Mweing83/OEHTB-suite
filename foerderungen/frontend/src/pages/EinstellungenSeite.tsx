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

export default function EinstellungenSeite() {
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const [provider, setProvider] = useState<Einstellungen["llm"]["provider"]>("dummy");
  const [modell, setModell] = useState("");
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
              onChange={(e) => setProvider(e.target.value as Einstellungen["llm"]["provider"])}
              className={eingabeKlasse + " mt-1"}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="dummy">Attrappe (ohne API-Key)</option>
            </select>
          </label>
          <label className="text-sm text-gray-700">
            Modell (leer = Standard)
            <input
              value={modell}
              onChange={(e) => setModell(e.target.value)}
              placeholder={provider === "openai" ? "gpt-4.1" : "claude-sonnet-4-6"}
              className={eingabeKlasse + " mt-1"}
            />
          </label>
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
