import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import {
  Ausschreibung,
  Ebene,
  Kategorie,
  EBENE_LABEL,
  KATEGORIE_LABEL,
  fristText,
  fristTage,
  fristKlasse,
} from "../lib/typen";

// Startseite: offene Ausschreibungen nach Frist sortiert, Dringlichkeit
// hervorgehoben (<= 30 Tage warnung, < 7 Tage gefahr), Filter nach Ebene,
// Kategorie und Thema. "Laufend einreichbar" als eigener Abschnitt.
export default function AusschreibungenSeite() {
  const [liste, setListe] = useState<Ausschreibung[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ebene, setEbene] = useState<Ebene | "">("");
  const [kategorie, setKategorie] = useState<Kategorie | "">("");
  const [thema, setThema] = useState("");

  useEffect(() => {
    api
      .get<Ausschreibung[]>("/api/ausschreibungen?status=OFFEN")
      .then(setListe)
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }, []);

  const themen = useMemo(() => {
    const s = new Set<string>();
    for (const a of liste) for (const t of a.foerderquelle?.themen ?? []) s.add(t);
    return [...s].sort();
  }, [liste]);

  const gefiltert = useMemo(
    () =>
      liste.filter((a) => {
        const q = a.foerderquelle;
        if (ebene && q?.ebene !== ebene) return false;
        if (kategorie && q?.kategorie !== kategorie && q?.kategorie !== "BEIDES") return false;
        if (thema && !(q?.themen ?? []).includes(thema)) return false;
        return true;
      }),
    [liste, ebene, kategorie, thema]
  );

  const mitFrist = gefiltert.filter((a) => !a.laufendEinreichbar);
  const laufend = gefiltert.filter((a) => a.laufendEinreichbar);

  const auswahlKlasse =
    "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm";

  function zeile(a: Ausschreibung) {
    const tage = fristTage(a);
    return (
      <li key={a.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={"text-sm " + fristKlasse(a)}>
            {fristText(a)}
            {tage !== null && tage >= 0 && (
              <span className="font-normal text-gray-400"> ({tage} Tage)</span>
            )}
          </span>
          <h2 className="text-base font-semibold text-gray-800">{a.titel}</h2>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {a.foerderquelle?.name}
          {a.foerderquelle && (
            <>
              {" · "}
              {EBENE_LABEL[a.foerderquelle.ebene]}
              {" · "}
              {KATEGORIE_LABEL[a.foerderquelle.kategorie]}
            </>
          )}
          {a.foerderhoehe && <> · {a.foerderhoehe}</>}
        </p>
        {a.beschreibung && <p className="text-sm text-gray-600 mt-2">{a.beschreibung}</p>}
        {a.link && (
          <a
            href={a.link}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-marke-600 hover:underline mt-2 inline-block"
          >
            Zur Ausschreibung ↗
          </a>
        )}
      </li>
    );
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Ausschreibungen</h1>
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
          <select value={thema} onChange={(e) => setThema(e.target.value)} className={auswahlKlasse} aria-label="Thema">
            <option value="">Alle Themen</option>
            {themen.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}
      {laedt ? (
        <p className="text-gray-500">Lädt …</p>
      ) : (
        <>
          {mitFrist.length === 0 && laufend.length === 0 && (
            <p className="text-gray-500">Keine offenen Ausschreibungen.</p>
          )}
          <ul className="space-y-3">{mitFrist.map(zeile)}</ul>
          {laufend.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-gray-800 mt-8 mb-3">
                Laufend einreichbar
              </h2>
              <ul className="space-y-3">{laufend.map(zeile)}</ul>
            </>
          )}
        </>
      )}
    </Layout>
  );
}
