import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import {
  Foerderquelle,
  Ebene,
  Kategorie,
  EBENE_LABEL,
  KATEGORIE_LABEL,
} from "../lib/typen";

// Katalog der Foerderlandschaft: aktive Quellen mit Filtern, dazu ein
// einfaches Formular zum Anlegen neuer Quellen.
export default function LandschaftSeite() {
  const [liste, setListe] = useState<Foerderquelle[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ebene, setEbene] = useState<Ebene | "">("");
  const [kategorie, setKategorie] = useState<Kategorie | "">("");
  const [zeigeFormular, setZeigeFormular] = useState(false);

  // Formularfelder fuer eine neue Quelle
  const [name, setName] = useState("");
  const [traeger, setTraeger] = useState("");
  const [neuEbene, setNeuEbene] = useState<Ebene>("BUND");
  const [neuKategorie, setNeuKategorie] = useState<Kategorie>("PROJEKT");
  const [themen, setThemen] = useState("");
  const [webseite, setWebseite] = useState("");
  const [beschreibung, setBeschreibung] = useState("");

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

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    try {
      await api.post<Foerderquelle>("/api/quellen", {
        name,
        traeger,
        ebene: neuEbene,
        kategorie: neuKategorie,
        themen: themen.split(",").map((t) => t.trim()).filter(Boolean),
        webseite: webseite || undefined,
        beschreibung: beschreibung || undefined,
      });
      setName(""); setTraeger(""); setThemen(""); setWebseite(""); setBeschreibung("");
      setZeigeFormular(false);
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  const eingabeKlasse =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-marke-500";
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
        <form onSubmit={anlegen} className="bg-white rounded-lg shadow-xs border border-gray-200 p-4 mb-6 grid gap-3 sm:grid-cols-2">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={eingabeKlasse} />
          <input required value={traeger} onChange={(e) => setTraeger(e.target.value)} placeholder="Träger" className={eingabeKlasse} />
          <select value={neuEbene} onChange={(e) => setNeuEbene(e.target.value as Ebene)} className={eingabeKlasse} aria-label="Ebene der neuen Quelle">
            {Object.entries(EBENE_LABEL).map(([w, l]) => (
              <option key={w} value={w}>{l}</option>
            ))}
          </select>
          <select value={neuKategorie} onChange={(e) => setNeuKategorie(e.target.value as Kategorie)} className={eingabeKlasse} aria-label="Kategorie der neuen Quelle">
            {Object.entries(KATEGORIE_LABEL).map(([w, l]) => (
              <option key={w} value={w}>{l}</option>
            ))}
          </select>
          <input value={themen} onChange={(e) => setThemen(e.target.value)} placeholder="Themen (kommagetrennt)" className={eingabeKlasse} />
          <input value={webseite} onChange={(e) => setWebseite(e.target.value)} placeholder="Webseite (https://…)" className={eingabeKlasse} />
          <textarea value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Beschreibung" className={eingabeKlasse + " sm:col-span-2"} rows={2} />
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700">
              Anlegen
            </button>
          </div>
        </form>
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
