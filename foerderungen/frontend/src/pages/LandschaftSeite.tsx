import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import Layout from "../components/Layout";
import QuelleFormular, { QuelleWerte } from "../components/QuelleFormular";
import { api } from "../lib/api";
import {
  Foerderquelle,
  Ebene,
  Kategorie,
  EBENE_LABEL,
  KATEGORIE_LABEL,
} from "../lib/typen";

// Katalog der Foerderlandschaft: aktive Quellen mit Filtern, dazu ein
// Formular zum Anlegen neuer Quellen (components/QuelleFormular).
export default function LandschaftSeite() {
  const [liste, setListe] = useState<Foerderquelle[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ebene, setEbene] = useState<Ebene | "">("");
  const [kategorie, setKategorie] = useState<Kategorie | "">("");
  const [zeigeFormular, setZeigeFormular] = useState(false);

  function laden() {
    api
      .get<Foerderquelle[]>("/api/quellen?status=AKTIV")
      .then(setListe)
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }
  useEffect(laden, []);

  const gefiltert = useMemo(
    () =>
      liste.filter(
        (q) =>
          (!ebene || q.ebene === ebene) &&
          (!kategorie || q.kategorie === kategorie || q.kategorie === "BEIDES")
      ),
    [liste, ebene, kategorie]
  );

  async function anlegen(werte: QuelleWerte) {
    setFehler(null);
    try {
      await api.post<Foerderquelle>("/api/quellen", {
        ...werte,
        // Leere optionale Felder weglassen.
        webseite: werte.webseite || undefined,
        kontakt: werte.kontakt || undefined,
        beschreibung: werte.beschreibung || undefined,
      });
      setZeigeFormular(false);
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  const auswahlKlasse =
    "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm";

  return (
    <Layout>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Förderlandschaft</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={ebene} onChange={(e) => setEbene(e.target.value as Ebene | "")} className={auswahlKlasse} aria-label="Ebene">
            <option value="">Alle Ebenen</option>
            {Object.entries(EBENE_LABEL).map(([w, l]) => (
              <option key={w} value={w}>{l}</option>
            ))}
          </select>
          <select value={kategorie} onChange={(e) => setKategorie(e.target.value as Kategorie | "")} className={auswahlKlasse} aria-label="Kategorie">
            <option value="">Projekt + Kerngeschäft</option>
            <option value="PROJEKT">Projekt</option>
            <option value="KERNGESCHAEFT">Kerngeschäft</option>
          </select>
          <button
            onClick={() => setZeigeFormular((z) => !z)}
            className="rounded-md bg-marke-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-marke-700"
          >
            {zeigeFormular ? "Abbrechen" : "Neue Quelle"}
          </button>
        </div>
      </div>

      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}

      {zeigeFormular && (
        <QuelleFormular knopfText="Anlegen" onSpeichern={anlegen} className="mb-6" />
      )}

      {laedt ? (
        <p className="text-gray-500">Lädt …</p>
      ) : gefiltert.length === 0 ? (
        <p className="text-gray-500">Keine Förderquellen gefunden.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {gefiltert.map((q) => (
            <li key={q.id}>
              <Link
                to={`/landschaft/${q.id}`}
                className="block bg-white rounded-lg shadow-xs border border-gray-200 p-4 hover:border-marke-400"
              >
                <h2 className="text-base font-semibold text-gray-800">{q.name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {q.traeger} · {EBENE_LABEL[q.ebene]} · {KATEGORIE_LABEL[q.kategorie]}
                </p>
                {q.themen.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{q.themen.join(", ")}</p>
                )}
                <p className="text-xs text-marke-600 mt-2">
                  {q._count?.ausschreibungen ?? 0} Ausschreibung(en)
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
