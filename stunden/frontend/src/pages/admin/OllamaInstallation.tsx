import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

// Abschnitt: Ollama-Installation auf dem Server (nur admin)
interface OllamaStatusDaten {
  installiert: boolean;
  laeuft: boolean;
  version: string | null;
  plattform: string;
  installBar: boolean;
  install: { status: "laeuft" | "fertig" | "fehler"; log: string } | null;
}

export default function OllamaInstallation() {
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
    <div className="bg-white rounded-lg shadow-xs p-6">
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
          <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 rounded-sm px-2 py-0.5">
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
            className="bg-marke-600 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
          >
            {laeuftGerade ? "Installiere …" : "Ollama installieren"}
          </button>
          <p className="text-xs text-slate-500 mt-2">
            Die Installation läuft mit erhöhten Rechten. Am Server erscheint ggf.
            eine UAC-/Rechteabfrage, die dort bestätigt werden muss.
          </p>
        </div>
      ) : (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-sm px-3 py-2">
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
            <pre className="text-xs bg-gray-900 text-gray-100 rounded-sm p-3 max-h-48 overflow-auto whitespace-pre-wrap">
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
