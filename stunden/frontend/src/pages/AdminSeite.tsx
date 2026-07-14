import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import Layout from "../components/Layout";

interface Einstellungen {
  llm: {
    provider: string;
    modell: string;
    endpoint: string;
    apiKeyGesetzt: boolean;
  };
  workflow: {
    modus: string;
    konfidenzSchwelle: number;
  };
  vollzeit: {
    stunden: number;
  };
}

export default function AdminSeite() {
  const { benutzer } = useAuth();

  if (benutzer?.rolle !== "ADMIN") {
    return (
      <Layout>
        <p className="text-gray-600">
          Dieser Bereich ist nur für Administratoren zugänglich.
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h2 className="text-xl font-semibold text-gray-800 mb-6">Administration</h2>
      <div className="space-y-6">
        <LlmEinstellungen />
        <OllamaInstallation />
        <VollzeitEinstellungen />
        <WorkflowEinstellungen />
        <ImapEinstellungen />
        <ErlaubteAbsender />
        <AuditAnsicht />
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Abschnitt: KI-Provider
// ---------------------------------------------------------------------------

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

function LlmEinstellungen() {
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
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="font-semibold text-gray-800 mb-4">KI-Provider</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Anbieter</label>
          <select
            value={provider}
            onChange={(e) => providerWechseln(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
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
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
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
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-2"
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
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
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
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
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
          className="bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          {speichert ? "Speichern …" : "Speichern"}
        </button>
        {meldung && <span className="text-sm text-gray-600">{meldung}</span>}
      </div>

      {provider === "ollama" && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 mt-3">
          Ollama läuft lokal – es verlässt kein Text das Haus, kein API-Key
          nötig. Voraussetzung: Der Ollama-Dienst läuft und das angegebene
          Modell ist geladen (z. B. <code>ollama pull llama3.1</code>). Endpoint
          leer lassen für den Standard <code>http://localhost:11434</code>.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abschnitt: Ollama-Installation auf dem Server (nur ADMIN)
// ---------------------------------------------------------------------------
interface OllamaStatusDaten {
  installiert: boolean;
  laeuft: boolean;
  version: string | null;
  plattform: string;
  installBar: boolean;
  install: { status: "laeuft" | "fertig" | "fehler"; log: string } | null;
}

function OllamaInstallation() {
  const [status, setStatus] = useState<OllamaStatusDaten | null>(null);
  const [startet, setStartet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try {
      const s = await api.get<OllamaStatusDaten>("/api/admin/ollama/status");
      setStatus(s);
    } catch {
      // Fehler ignorieren – erneuter Versuch beim naechsten Laden.
    }
  }, []);

  useEffect(() => {
    laden();
  }, [laden]);

  // Waehrend der Installation regelmaessig aktualisieren.
  useEffect(() => {
    if (status?.install?.status !== "laeuft") return;
    const t = setInterval(laden, 2000);
    return () => clearInterval(t);
  }, [status, laden]);

  async function installieren() {
    setStartet(true);
    setFehler(null);
    try {
      await api.post("/api/admin/ollama/install");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setStartet(false);
    }
  }

  const laeuftGerade = status?.install?.status === "laeuft";

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="font-semibold text-gray-800 mb-1">
        Ollama (lokales KI-Modell)
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Ollama auf diesem Server installieren, um KI-Anfragen lokal – ohne
        Datenabfluss – zu verarbeiten.
      </p>

      {!status ? (
        <p className="text-sm text-gray-500">Prüfe …</p>
      ) : status.installiert ? (
        <p className="text-sm text-gray-700">
          <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 rounded px-2 py-0.5">
            Installiert{status.version ? ` (${status.version})` : ""}
          </span>{" "}
          {status.laeuft
            ? "– Dienst läuft."
            : "– Dienst derzeit nicht erreichbar."}
        </p>
      ) : status.installBar ? (
        <div>
          <p className="text-sm text-gray-700 mb-3">
            Ollama ist auf diesem Server (<code>{status.plattform}</code>) nicht
            installiert.
          </p>
          <button
            onClick={installieren}
            disabled={startet || laeuftGerade}
            className="bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
          >
            {laeuftGerade ? "Installiere …" : "Ollama installieren"}
          </button>
          <p className="text-xs text-slate-500 mt-2">
            Die Installation läuft mit erhöhten Rechten. Am Server erscheint ggf.
            eine UAC-/Rechteabfrage, die dort bestätigt werden muss.
          </p>
        </div>
      ) : (
        <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
          Automatische Installation auf diesem Betriebssystem (
          <code>{status.plattform}</code>) nicht möglich. Bitte manuell von{" "}
          <a
            className="underline"
            href="https://ollama.com/download"
            target="_blank"
            rel="noreferrer"
          >
            ollama.com/download
          </a>{" "}
          installieren.
        </p>
      )}

      {fehler && <p className="text-sm text-red-600 mt-3">{fehler}</p>}

      {status?.install && (
        <div className="mt-4">
          <p className="text-sm mb-1">
            {status.install.status === "laeuft" && (
              <span className="text-marke-700">Installation läuft …</span>
            )}
            {status.install.status === "fertig" && (
              <span className="text-green-700">
                Installation abgeschlossen. Ggf. Backend neu starten, damit
                „ollama“ im PATH verfügbar ist.
              </span>
            )}
            {status.install.status === "fehler" && (
              <span className="text-red-700">
                Installation fehlgeschlagen (siehe Log). Alternativ manuell
                installieren.
              </span>
            )}
          </p>
          {status.install.log && (
            <pre className="text-xs bg-gray-900 text-gray-100 rounded p-3 max-h-48 overflow-auto whitespace-pre-wrap">
              {status.install.log}
            </pre>
          )}
          <button
            onClick={laden}
            className="mt-2 text-xs text-marke-600 hover:underline"
          >
            Status aktualisieren
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abschnitt: Referenz-Wochenstunden (= 100 %)
// ---------------------------------------------------------------------------
function VollzeitEinstellungen() {
  const [stunden, setStunden] = useState("38,5");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    api.get<Einstellungen>("/api/admin/einstellungen").then((e) => {
      // Im deutschen Layout mit Komma anzeigen.
      setStunden(String(e.vollzeit.stunden).replace(".", ","));
    });
  }, []);

  async function speichern() {
    const wert = Number(stunden.replace(",", "."));
    if (!Number.isFinite(wert) || wert <= 0 || wert > 60) {
      setMeldung("Bitte eine gültige Stundenzahl (1–60) angeben.");
      return;
    }
    setSpeichert(true);
    setMeldung(null);
    try {
      await api.put("/api/admin/vollzeit", { stunden: wert });
      setMeldung("Gespeichert.");
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="font-semibold text-gray-800 mb-1">Referenz-Wochenstunden</h3>
      <p className="text-xs text-gray-500 mb-4">
        Wochenstunden, die 100 % Beschäftigungsausmaß entsprechen (Vollzeit).
        Wird für die KI-Umrechnung zwischen Stunden und Prozent verwendet.
      </p>
      <div className="flex items-center gap-3">
        <input
          value={stunden}
          onChange={(e) => setStunden(e.target.value)}
          inputMode="decimal"
          className="w-28 border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <span className="text-sm text-gray-500">Wochenstunden = 100 %</span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={speichern}
          disabled={speichert}
          className="bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          {speichert ? "Speichern …" : "Speichern"}
        </button>
        {meldung && <span className="text-sm text-gray-600">{meldung}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abschnitt: Bestaetigungs-Modus
// ---------------------------------------------------------------------------
function WorkflowEinstellungen() {
  const [modus, setModus] = useState("immer_manuell");
  const [schwelle, setSchwelle] = useState(0.8);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    api.get<Einstellungen>("/api/admin/einstellungen").then((e) => {
      setModus(e.workflow.modus);
      setSchwelle(e.workflow.konfidenzSchwelle);
    });
  }, []);

  async function speichern() {
    setSpeichert(true);
    setMeldung(null);
    try {
      await api.put("/api/admin/workflow", {
        modus,
        konfidenzSchwelle: schwelle,
      });
      setMeldung("Gespeichert.");
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="font-semibold text-gray-800 mb-4">
        Bestätigung von Anfragen
      </h3>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={modus === "immer_manuell"}
            onChange={() => setModus("immer_manuell")}
          />
          Immer manuell bestätigen (sicherste Variante)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={modus === "ab_konfidenz"}
            onChange={() => setModus("ab_konfidenz")}
          />
          Automatisch ab Konfidenz-Schwelle, sonst manuell
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={modus === "automatisch"}
            onChange={() => setModus("automatisch")}
          />
          Immer automatisch übernehmen
        </label>
      </div>

      {modus === "ab_konfidenz" && (
        <div className="mt-4">
          <label className="block text-sm text-gray-700 mb-1">
            Konfidenz-Schwelle: {Math.round(schwelle * 100)} %
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={schwelle}
            onChange={(e) => setSchwelle(Number(e.target.value))}
            className="w-64"
          />
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={speichern}
          disabled={speichert}
          className="bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          {speichert ? "Speichern …" : "Speichern"}
        </button>
        {meldung && <span className="text-sm text-gray-600">{meldung}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abschnitt: AuditLog-Ansicht (DSGVO-Nachweis)
// ---------------------------------------------------------------------------
interface AuditRow {
  id: string;
  zeitpunkt: string;
  aktion: string;
  benutzer: string | null;
  betroffenerMitarbeiter: string | null;
  details: unknown;
}

function AuditAnsicht() {
  const [eintraege, setEintraege] = useState<AuditRow[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [geladen, setGeladen] = useState(false);

  function laden() {
    setLaedt(true);
    api
      .get<AuditRow[]>("/api/admin/audit")
      .then(setEintraege)
      .finally(() => {
        setLaedt(false);
        setGeladen(true);
      });
  }

  // Datum/Zeit im europaeischen Layout: DD/MM/YYYY, HH:MM.
  function zeitDe(iso: string): string {
    const d = new Date(iso);
    const tag = String(d.getDate()).padStart(2, "0");
    const monat = String(d.getMonth() + 1).padStart(2, "0");
    const stunde = String(d.getHours()).padStart(2, "0");
    const minute = String(d.getMinutes()).padStart(2, "0");
    return `${tag}/${monat}/${d.getFullYear()}, ${stunde}:${minute}`;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800">Protokoll (Audit-Log)</h3>
          <p className="text-xs text-gray-500">
            Nachweis aller relevanten Zugriffe und Änderungen (DSGVO).
          </p>
        </div>
        <button
          onClick={laden}
          className="bg-marke-600 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-marke-700"
        >
          {geladen ? "Aktualisieren" : "Protokoll laden"}
        </button>
      </div>

      {laedt && <p className="text-gray-500 text-sm">Lädt …</p>}

      {geladen && !laedt && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="py-2 font-medium">Zeitpunkt</th>
                <th className="py-2 font-medium">Aktion</th>
                <th className="py-2 font-medium">Benutzer</th>
                <th className="py-2 font-medium">Betrifft</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {eintraege.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 text-gray-600 whitespace-nowrap">
                    {zeitDe(e.zeitpunkt)}
                  </td>
                  <td className="py-2">
                    <span className="text-xs bg-gray-100 rounded px-2 py-0.5">
                      {e.aktion}
                    </span>
                  </td>
                  <td className="py-2 text-gray-600">{e.benutzer ?? "–"}</td>
                  <td className="py-2 text-gray-600">
                    {e.betroffenerMitarbeiter ?? "–"}
                  </td>
                </tr>
              ))}
              {eintraege.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">
                    Keine Einträge.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abschnitt: IMAP-Postfach (E-Mail-Abruf)
// ---------------------------------------------------------------------------
interface ImapKonfigUI {
  aktiv: boolean;
  host: string;
  port: number;
  secure: boolean;
  benutzer: string;
  intervallMinuten: number;
  passwortGesetzt: boolean;
}

function ImapEinstellungen() {
  const [aktiv, setAktiv] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(993);
  const [secure, setSecure] = useState(true);
  const [benutzer, setBenutzer] = useState("");
  const [intervall, setIntervall] = useState(15);
  const [passwort, setPasswort] = useState("");
  const [passwortGesetzt, setPasswortGesetzt] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [ruftAb, setRuftAb] = useState(false);
  const [abrufMeldung, setAbrufMeldung] = useState<string | null>(null);

  const laden = useCallback(() => {
    api.get<ImapKonfigUI>("/api/admin/imap").then((k) => {
      setAktiv(k.aktiv);
      setHost(k.host);
      setPort(k.port);
      setSecure(k.secure);
      setBenutzer(k.benutzer);
      setIntervall(k.intervallMinuten);
      setPasswortGesetzt(k.passwortGesetzt);
    });
  }, []);
  useEffect(laden, [laden]);

  async function speichern() {
    setSpeichert(true);
    setMeldung(null);
    try {
      await api.put("/api/admin/imap", {
        aktiv,
        host,
        port,
        secure,
        benutzer,
        intervallMinuten: intervall,
        passwort, // leer = unveraendert
      });
      setPasswort("");
      setMeldung("Gespeichert.");
      laden();
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setSpeichert(false);
    }
  }

  async function jetztAbrufen() {
    setRuftAb(true);
    setAbrufMeldung(null);
    try {
      const r = await api.post<{ abgerufen: number; fehler: string | null }>(
        "/api/admin/imap/abrufen"
      );
      if (r.fehler) {
        setAbrufMeldung(`Fehler: ${r.fehler}`);
      } else {
        setAbrufMeldung(`${r.abgerufen} Mail(s) verarbeitet.`);
      }
    } catch (err) {
      setAbrufMeldung(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setRuftAb(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800">E-Mail-Abruf (IMAP)</h3>
          <p className="text-xs text-gray-500">
            Ruft ungelesene Mails ab und legt sie als Anfragen in die Queue.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={aktiv}
            onChange={(e) => setAktiv(e.target.checked)}
          />
          Automatischer Abruf aktiv
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Server (Host)</label>
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="imap.dienstleister.at"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={secure}
                onChange={(e) => setSecure(e.target.checked)}
              />
              TLS
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Benutzer</label>
          <input
            value={benutzer}
            onChange={(e) => setBenutzer(e.target.value)}
            placeholder="postfach@dienstleister.at"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Passwort{" "}
            {passwortGesetzt && (
              <span className="text-green-600 text-xs">
                (gesetzt – leer lassen zum Beibehalten)
              </span>
            )}
          </label>
          <input
            type="password"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            placeholder={passwortGesetzt ? "•••••••• (unverändert)" : "Passwort"}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Abruf-Intervall (Minuten)
          </label>
          <input
            type="number"
            value={intervall}
            onChange={(e) => setIntervall(Number(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={speichern}
          disabled={speichert}
          className="bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          {speichert ? "Speichern …" : "Speichern"}
        </button>
        <button
          onClick={jetztAbrufen}
          disabled={ruftAb}
          className="bg-gray-200 text-gray-700 rounded px-4 py-2 text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
        >
          {ruftAb ? "Rufe ab …" : "Jetzt manuell abrufen"}
        </button>
        {meldung && <span className="text-sm text-gray-600">{meldung}</span>}
        {abrufMeldung && (
          <span className="text-sm text-gray-600">{abrufMeldung}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abschnitt: Erlaubte Absender (Whitelist fuer IMAP-Mails)
// ---------------------------------------------------------------------------
function ErlaubteAbsender() {
  const [adressen, setAdressen] = useState<string[]>([]);
  const [neu, setNeu] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  const laden = useCallback(() => {
    api
      .get<{ adressen: string[] }>("/api/admin/absender")
      .then((d) => setAdressen(d.adressen));
  }, []);
  useEffect(laden, [laden]);

  async function speichern(neueListe: string[]) {
    setSpeichert(true);
    setMeldung(null);
    try {
      const d = await api.put<{ adressen: string[] }>("/api/admin/absender", {
        adressen: neueListe,
      });
      setAdressen(d.adressen);
      setMeldung("Gespeichert.");
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setSpeichert(false);
    }
  }

  function hinzufuegen() {
    const adresse = neu.trim().toLowerCase();
    if (!adresse) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) {
      setMeldung("Bitte eine gültige E-Mail-Adresse eingeben.");
      return;
    }
    if (adressen.includes(adresse)) {
      setMeldung("Adresse ist bereits in der Liste.");
      return;
    }
    const neueListe = [...adressen, adresse];
    setNeu("");
    speichern(neueListe);
  }

  function entfernen(adresse: string) {
    const neueListe = adressen.filter((a) => a !== adresse);
    speichern(neueListe);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="font-semibold text-gray-800">Erlaubte Absender</h3>
      <p className="text-xs text-gray-500 mb-4">
        Nur Mails von diesen Adressen werden verarbeitet. Mails von anderen
        Absendern werden verworfen und im Protokoll vermerkt. Ist die Liste
        leer, werden – zur Sicherheit – gar keine IMAP-Mails angenommen.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          value={neu}
          onChange={(e) => setNeu(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") hinzufuegen();
          }}
          placeholder="name@oehtb.at"
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <button
          onClick={hinzufuegen}
          disabled={speichert}
          className="bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          Hinzufügen
        </button>
      </div>

      {adressen.length === 0 ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
          Noch keine erlaubten Absender. Aktuell werden keine IMAP-Mails
          angenommen.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded">
          {adressen.map((a) => (
            <li
              key={a}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="text-gray-700">{a}</span>
              <button
                onClick={() => entfernen(a)}
                disabled={speichert}
                className="text-red-600 hover:underline text-xs disabled:opacity-50"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      {meldung && <p className="text-sm text-gray-600 mt-3">{meldung}</p>}
    </div>
  );
}
