import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { type Einstellungen } from "./typen";

// Abschnitt: Referenz-Wochenstunden (= 100 %)
export default function VollzeitEinstellungen() {
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
    <div className="bg-white rounded-lg shadow-xs p-6">
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
          className="w-28 border border-gray-300 rounded-sm px-3 py-2 text-sm"
        />
        <span className="text-sm text-gray-500">Wochenstunden = 100 %</span>
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
    </div>
  );
}
