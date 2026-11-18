import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

// Abschnitt: Erlaubte Absender (Whitelist fuer IMAP-Mails)
export default function ErlaubteAbsender() {
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
    <div className="bg-white rounded-lg shadow-xs p-6">
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
          className="flex-1 border border-gray-300 rounded-sm px-3 py-2 text-sm"
        />
        <button
          onClick={hinzufuegen}
          disabled={speichert}
          className="bg-marke-600 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          Hinzufügen
        </button>
      </div>

      {adressen.length === 0 ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-sm px-3 py-2">
          Noch keine erlaubten Absender. Aktuell werden keine IMAP-Mails
          angenommen.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-sm">
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
