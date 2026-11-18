import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import Layout from "../components/Layout";
import QuelleFormular, { QuelleWerte } from "../components/QuelleFormular";
import { api } from "../lib/api";
import {
  Foerderquelle,
  Ausschreibung,
  EBENE_LABEL,
  KATEGORIE_LABEL,
  fristText,
  fristKlasse,
} from "../lib/typen";

// Detailansicht einer Foerderquelle: Stammdaten bearbeiten, zugehoerige
// Ausschreibungen ansehen und neue anlegen. Archivieren statt Loeschen.
export default function QuelleDetailSeite() {
  const { id } = useParams<{ id: string }>();
  const navigiere = useNavigate();
  const [quelle, setQuelle] = useState<Foerderquelle | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  // Zählt die Ladevorgänge: baut das Stammdaten-Formular nach jedem Laden
  // mit den Werten vom Server neu auf.
  const [stand, setStand] = useState(0);

  // Neue Ausschreibung
  const [neuTitel, setNeuTitel] = useState("");
  const [neuLink, setNeuLink] = useState("");
  const [neuFrist, setNeuFrist] = useState("");
  const [neuLaufend, setNeuLaufend] = useState(false);
  const [neuHoehe, setNeuHoehe] = useState("");

  function laden() {
    if (!id) return;
    api
      .get<Foerderquelle>(`/api/quellen/${id}`)
      .then((q) => {
        setQuelle(q);
        setStand((n) => n + 1);
      })
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }
  useEffect(laden, [id]);

  async function speichern(werte: QuelleWerte) {
    setFehler(null);
    setMeldung(null);
    try {
      await api.patch(`/api/quellen/${id}`, {
        ...werte,
        // Leere Felder ausdrücklich leeren (null bzw. ""), nicht weglassen –
        // sonst bliebe der alte Wert stehen.
        webseite: werte.webseite || null,
        kontakt: werte.kontakt || null,
      });
      setMeldung("Gespeichert.");
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  async function archivieren() {
    if (!window.confirm("Quelle archivieren? Sie erscheint dann nicht mehr im Katalog.")) return;
    try {
      await api.patch(`/api/quellen/${id}`, { status: "ARCHIVIERT" });
      navigiere("/landschaft");
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  async function ausschreibungAnlegen(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    try {
      await api.post("/api/ausschreibungen", {
        foerderquelleId: id,
        titel: neuTitel,
        link: neuLink || undefined,
        frist: neuFrist || undefined,
        laufendEinreichbar: neuLaufend,
        foerderhoehe: neuHoehe || undefined,
      });
      setNeuTitel(""); setNeuLink(""); setNeuFrist(""); setNeuLaufend(false); setNeuHoehe("");
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  const eingabeKlasse =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-marke-500";

  if (laedt) return <Layout><p className="text-gray-500">Lädt …</p></Layout>;
  if (!quelle) return <Layout><p className="text-gefahr-700">{fehler ?? "Nicht gefunden."}</p></Layout>;

  return (
    <Layout>
      <div className="mb-4">
        <Link to="/landschaft" className="text-sm text-marke-600 hover:underline">
          ← Zur Förderlandschaft
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-800">{quelle.name}</h1>
        <span className="text-sm text-gray-500">
          {EBENE_LABEL[quelle.ebene]} · {KATEGORIE_LABEL[quelle.kategorie]}
        </span>
        <button
          onClick={archivieren}
          className="ml-auto rounded-md border border-gefahr-600 text-gefahr-700 px-3 py-1.5 text-sm font-medium hover:bg-gefahr-50"
        >
          Archivieren
        </button>
      </div>

      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}
      {meldung && <p className="text-erfolg-700 mb-4">{meldung}</p>}

      <QuelleFormular key={stand} quelle={quelle} knopfText="Speichern" onSpeichern={speichern} className="mb-8" />

      <h2 className="text-lg font-semibold text-gray-800 mb-3">Ausschreibungen</h2>
      <ul className="space-y-2 mb-6">
        {(quelle.ausschreibungen ?? []).length === 0 && (
          <li className="text-gray-500 text-sm">Noch keine Ausschreibungen erfasst.</li>
        )}
        {(quelle.ausschreibungen ?? []).map((a: Ausschreibung) => (
          <li key={a.id} className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-baseline gap-x-3">
            <span className={"text-sm " + fristKlasse(a)}>{fristText(a)}</span>
            <span className="text-sm font-medium text-gray-800">{a.titel}</span>
            <span className="text-xs text-gray-400">{a.status}</span>
            {a.link && (
              <a href={a.link} target="_blank" rel="noreferrer" className="text-xs text-marke-600 hover:underline">
                Link ↗
              </a>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={ausschreibungAnlegen} className="bg-white rounded-lg shadow-xs border border-gray-200 p-4 grid gap-3 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-sm font-semibold text-gray-700">Neue Ausschreibung</h3>
        <input required value={neuTitel} onChange={(e) => setNeuTitel(e.target.value)} placeholder="Titel" className={eingabeKlasse} />
        <input value={neuLink} onChange={(e) => setNeuLink(e.target.value)} placeholder="Link (https://…)" className={eingabeKlasse} />
        <input type="date" value={neuFrist} onChange={(e) => setNeuFrist(e.target.value)} className={eingabeKlasse} aria-label="Frist" disabled={neuLaufend} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={neuLaufend} onChange={(e) => setNeuLaufend(e.target.checked)} />
          laufend einreichbar
        </label>
        <input value={neuHoehe} onChange={(e) => setNeuHoehe(e.target.value)} placeholder="Förderhöhe (Freitext)" className={eingabeKlasse} />
        <div className="sm:col-span-2">
          <button type="submit" className="rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700">
            Anlegen
          </button>
        </div>
      </form>
    </Layout>
  );
}
