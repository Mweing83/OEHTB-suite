import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import {
  Ausschreibung,
  Foerderquelle,
  EBENE_LABEL,
  KATEGORIE_LABEL,
  fristText,
} from "../lib/typen";

// Pruef-Warteschlange: alles, was der Scanner vorgeschlagen hat. Nichts davon
// erscheint in den Hauptansichten, bevor es hier uebernommen wurde.
// Uebernehmen: Quelle -> AKTIV, Ausschreibung -> OFFEN (Aktualisierungs-
// vorschlaege uebertragen dabei ihre Felder auf die Bestandszeile).
// Ablehnen: Quelle -> ARCHIVIERT, Ausschreibung -> ABGELEHNT (Tombstones).
export default function PruefenSeite() {
  const [quellen, setQuellen] = useState<Foerderquelle[]>([]);
  const [ausschreibungen, setAusschreibungen] = useState<Ausschreibung[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  function laden() {
    setLaedt(true);
    Promise.all([
      api.get<Foerderquelle[]>("/api/quellen?status=VORGESCHLAGEN"),
      api.get<Ausschreibung[]>("/api/ausschreibungen?status=VORGESCHLAGEN"),
    ])
      .then(([q, a]) => {
        setQuellen(q);
        setAusschreibungen(a);
      })
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }
  useEffect(laden, []);

  async function entscheideQuelle(id: string, status: "AKTIV" | "ARCHIVIERT") {
    try {
      await api.patch(`/api/quellen/${id}`, { status });
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  async function entscheideAusschreibung(id: string, status: "OFFEN" | "ABGELEHNT") {
    try {
      await api.patch(`/api/ausschreibungen/${id}`, { status });
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  function knoepfe(uebernehmen: () => void, ablehnen: () => void) {
    return (
      <div className="flex gap-2 mt-3">
        <button
          onClick={uebernehmen}
          className="rounded-md bg-erfolg-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-erfolg-700"
        >
          Übernehmen
        </button>
        <button
          onClick={ablehnen}
          className="rounded-md border border-gefahr-600 text-gefahr-700 px-3 py-1.5 text-sm font-medium hover:bg-gefahr-50"
        >
          Ablehnen
        </button>
      </div>
    );
  }

  return (
    <Layout>
      <h1 className="text-xl font-semibold text-gray-800 mb-6">Prüfen</h1>
      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}
      {laedt ? (
        <p className="text-gray-500">Lädt …</p>
      ) : quellen.length === 0 && ausschreibungen.length === 0 ? (
        <p className="text-gray-500">Keine offenen Vorschläge – alles geprüft.</p>
      ) : (
        <>
          {quellen.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                Vorgeschlagene Förderquellen
              </h2>
              <ul className="space-y-3 mb-8">
                {quellen.map((q) => (
                  <li key={q.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="text-base font-semibold text-gray-800">{q.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {q.traeger} · {EBENE_LABEL[q.ebene]} · {KATEGORIE_LABEL[q.kategorie]}
                    </p>
                    {q.beschreibung && (
                      <p className="text-sm text-gray-600 mt-1">{q.beschreibung}</p>
                    )}
                    {q.webseite && (
                      <a href={q.webseite} target="_blank" rel="noreferrer" className="text-sm text-marke-600 hover:underline mt-1 inline-block">
                        {q.webseite} ↗
                      </a>
                    )}
                    {knoepfe(
                      () => entscheideQuelle(q.id, "AKTIV"),
                      () => entscheideQuelle(q.id, "ARCHIVIERT")
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {ausschreibungen.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                Vorgeschlagene Ausschreibungen
              </h2>
              <ul className="space-y-3">
                {ausschreibungen.map((a) => (
                  <li key={a.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    {a.aktualisiertAusschreibung && (
                      <p className="text-xs font-semibold text-warnung-700 uppercase tracking-wide mb-1">
                        Aktualisierungsvorschlag
                      </p>
                    )}
                    <h3 className="text-base font-semibold text-gray-800">{a.titel}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {a.foerderquelle?.name}
                      {a.foerderhoehe && <> · {a.foerderhoehe}</>}
                    </p>
                    {a.aktualisiertAusschreibung ? (
                      <p className="text-sm mt-1">
                        <span className="text-gray-500">
                          Frist bisher: {fristText(a.aktualisiertAusschreibung)}
                        </span>
                        {" → "}
                        <span className="font-medium text-gray-800">neu: {fristText(a)}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-gray-700 mt-1">Frist: {fristText(a)}</p>
                    )}
                    {a.beschreibung && (
                      <p className="text-sm text-gray-600 mt-1">{a.beschreibung}</p>
                    )}
                    {a.link && (
                      <a href={a.link} target="_blank" rel="noreferrer" className="text-sm text-marke-600 hover:underline mt-1 inline-block">
                        Quelle des Scanners ↗
                      </a>
                    )}
                    {knoepfe(
                      () => entscheideAusschreibung(a.id, "OFFEN"),
                      () => entscheideAusschreibung(a.id, "ABGELEHNT")
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Layout>
  );
}
