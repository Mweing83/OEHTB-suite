import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { type Einstellungen } from "./typen";

// Abschnitt: Bestaetigungs-Modus
export default function WorkflowEinstellungen() {
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
    <div className="bg-white rounded-lg shadow-xs p-6">
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
          className="bg-marke-600 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          {speichert ? "Speichern …" : "Speichern"}
        </button>
        {meldung && <span className="text-sm text-gray-600">{meldung}</span>}
      </div>
    </div>
  );
}
