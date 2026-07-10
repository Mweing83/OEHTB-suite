import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { formatCent, summeSteuerCent } from "../lib/geld.js";
import BuchungsFormular, { type KorrekturVorlage } from "../components/BuchungsFormular.js";
import DatumFeld, { isoZuDe } from "../components/DatumFeld.js";

interface Kostenstelle {
  id: number;
  bezeichnung: string;
  bereich: { id: number; bezeichnung: string };
  saldoCent: number;
}

interface Buchung {
  id: number;
  buchungsnummer: number;
  belegnummer: string;
  belegdatum: string;
  betragCent: number;
  typ: "eingang" | "ausgang";
  beschreibung?: string;
  storniert: boolean;
  gesperrt: boolean;
  ersteller: { name: string };
  beleg?: { id: number; originalname: string } | null;
  korrekturVon?: { buchungsnummer: number } | null;
  positionen: { steuersatz: number; betragCent: number; kontoId: number; konto: { nummer: string } }[];
}

export default function BuchungenSeite() {
  const [kostenstellen, setKostenstellen] = useState<Kostenstelle[]>([]);
  const [aktiv, setAktiv] = useState<number | null>(null);
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);

  // Filter-Zustand (alles im Browser, sofort wirkend)
  const [suche, setSuche] = useState("");
  const [vonDatum, setVonDatum] = useState("");
  const [bisDatum, setBisDatum] = useState("");
  const [kontoFilter, setKontoFilter] = useState(""); // Kontonummer oder ""
  const [typFilter, setTypFilter] = useState<"" | "eingang" | "ausgang">("");
  const [stornierteZeigen, setStornierteZeigen] = useState(false);

  // Aktive Korrektur-Vorlage (wenn gesetzt, arbeitet das Formular im Korrektur-Modus)
  const [korrektur, setKorrektur] = useState<KorrekturVorlage | null>(null);

  // Beleg-Vorschau im rechten Panel (statt in einem neuen Tab)
  const [belegVorschau, setBelegVorschau] = useState<{ id: number; originalname: string; belegnummer: string } | null>(null);

  useEffect(() => {
    api.get<Kostenstelle[]>("/kostenstellen").then((ks) => {
      setKostenstellen(ks);
      if (ks.length && aktiv === null) setAktiv(ks[0].id);
    });
  }, []);

  function ladeBuchungen(ksId: number) {
    api.get<Buchung[]>(`/buchungen?kostenstelle=${ksId}`).then(setBuchungen).catch(() => setBuchungen([]));
  }

  useEffect(() => {
    if (aktiv) ladeBuchungen(aktiv);
  }, [aktiv]);

  const aktuelleKs = kostenstellen.find((k) => k.id === aktiv);

  // Alle in den Buchungen vorkommenden Konten (für das Konto-Dropdown)
  const verfuegbareKonten = Array.from(
    new Set(buchungen.flatMap((b) => b.positionen.map((p) => p.konto.nummer)))
  ).sort();

  // Gefilterte Liste (alle Filter werden im Browser kombiniert angewendet)
  const gefiltert = buchungen.filter((b) => {
    if (!stornierteZeigen && b.storniert) return false;
    if (typFilter && b.typ !== typFilter) return false;
    if (kontoFilter && !b.positionen.some((p) => p.konto.nummer === kontoFilter)) return false;

    const datum = b.belegdatum.slice(0, 10);
    if (vonDatum && datum < vonDatum) return false;
    if (bisDatum && datum > bisDatum) return false;

    if (suche.trim()) {
      const text = suche.trim().toLowerCase();
      const inBeschreibung = (b.beschreibung ?? "").toLowerCase().includes(text);
      const inKonto = b.positionen.some((p) => p.konto.nummer.toLowerCase().includes(text));
      const inNummer = String(b.buchungsnummer).includes(text) || String(b.belegnummer).includes(text);
      if (!inBeschreibung && !inKonto && !inNummer) return false;
    }
    return true;
  });

  function filterZuruecksetzen() {
    setSuche("");
    setVonDatum("");
    setBisDatum("");
    setKontoFilter("");
    setTypFilter("");
    setStornierteZeigen(false);
  }

  async function storno(id: number) {
    if (!confirm("Diese Buchung stornieren?")) return;
    await api.post(`/buchungen/${id}/storno`).catch((e) => alert((e as Error).message));
    if (aktiv) {
      ladeBuchungen(aktiv);
      api.get<Kostenstelle[]>("/kostenstellen").then(setKostenstellen);
    }
  }

  // Korrektur starten: aus der gewählten Buchung eine Vorlage bauen und das
  // Formular in den Korrektur-Modus versetzen. Beträge werden von Cent in den
  // Euro-Eingabetext ("12,50") umgewandelt.
  function korrekturStarten(b: Buchung) {
    const vorlage: KorrekturVorlage = {
      buchungId: b.id,
      buchungsnummer: b.buchungsnummer,
      belegdatum: b.belegdatum.slice(0, 10),
      typ: b.typ,
      beschreibung: b.beschreibung ?? "",
      positionen: b.positionen.map((p) => ({
        betrag: (p.betragCent / 100).toFixed(2).replace(".", ","),
        steuersatz: p.steuersatz,
        kontoId: p.kontoId,
      })),
    };
    setKorrektur(vorlage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm font-medium">Kostenstelle:</label>
        <select
          className="border rounded px-3 py-2"
          value={aktiv ?? ""}
          onChange={(e) => setAktiv(Number(e.target.value))}
        >
          {kostenstellen.map((k) => (
            <option key={k.id} value={k.id}>
              {k.bezeichnung} ({k.bereich.bezeichnung})
            </option>
          ))}
        </select>
        {aktuelleKs && (
          <span className="ml-auto text-sm">
            Kassenstand:{" "}
            <span className="font-semibold">{formatCent(aktuelleKs.saldoCent)}</span>
          </span>
        )}
      </div>

      <div className="space-y-6">
        {aktiv && <BuchungsFormular
          kostenstelleId={aktiv}
          korrektur={korrektur}
          onKorrekturAbbrechen={() => setKorrektur(null)}
          onGespeichert={() => {
            ladeBuchungen(aktiv);
            api.get<Kostenstelle[]>("/kostenstellen").then(setKostenstellen);
          }}
        />}

        <div className="flex gap-6 items-start">
          <div className="bg-white rounded-lg shadow p-5 flex-1 min-w-0">
          <h2 className="font-semibold text-blue-900 mb-4">Buchungen</h2>

          {/* Filterleiste */}
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-slate-500 mb-1">Suche (Beschreibung, Konto, Nr.)</label>
                <input
                  className="w-full border rounded px-3 py-1.5 text-sm"
                  placeholder="Suchbegriff…"
                  value={suche}
                  onChange={(e) => setSuche(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Von</label>
                <DatumFeld size="klein" className="w-[150px]" wert={vonDatum} onChange={setVonDatum} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Bis</label>
                <DatumFeld size="klein" className="w-[150px]" wert={bisDatum} onChange={setBisDatum} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Konto</label>
                <select className="border rounded px-3 py-1.5 text-sm"
                  value={kontoFilter} onChange={(e) => setKontoFilter(e.target.value)}>
                  <option value="">Alle</option>
                  {verfuegbareKonten.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Typ</label>
                <select className="border rounded px-3 py-1.5 text-sm"
                  value={typFilter} onChange={(e) => setTypFilter(e.target.value as "" | "eingang" | "ausgang")}>
                  <option value="">Alle</option>
                  <option value="eingang">Eingang</option>
                  <option value="ausgang">Ausgang</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={stornierteZeigen}
                  onChange={(e) => setStornierteZeigen(e.target.checked)} />
                Stornierte anzeigen
              </label>
              <button onClick={filterZuruecksetzen} className="text-sm text-blue-700 hover:underline">
                Filter zurücksetzen
              </button>
              <span className="ml-auto text-xs text-slate-500">
                {gefiltert.length} von {buchungen.length} Buchungen
              </span>
            </div>
          </div>

          {buchungen.length === 0 ? (
            <p className="text-sm text-slate-500">Noch keine Buchungen.</p>
          ) : gefiltert.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Buchungen entsprechen den Filterkriterien.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2">Nr.</th>
                  <th>Beleg-Nr.</th>
                  <th>Beleg</th>
                  <th>Datum</th>
                  <th>Beschreibung</th>
                  <th className="text-right">Betrag</th>
                  <th className="text-right">MwSt</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((b) => (
                  <tr key={b.id} className={`border-b last:border-0 ${b.storniert ? "text-slate-400 line-through" : ""}`}>
                    <td className="py-2">{b.buchungsnummer}</td>
                    <td>{b.belegnummer.replace(/^\d{4}-/, "")}</td>
                    <td>
                      {b.beleg ? (
                        <button
                          type="button"
                          onClick={() => setBelegVorschau({ id: b.beleg!.id, originalname: b.beleg!.originalname, belegnummer: b.belegnummer })}
                          className={belegVorschau?.id === b.beleg.id ? "text-blue-900" : "text-blue-700 hover:text-blue-900"}
                          title={`Beleg ansehen (${b.beleg.originalname})`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-4 h-4 inline-block align-text-bottom"
                          >
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="M21 15l-5-5L5 21" />
                          </svg>
                        </button>
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>
                    <td>{isoZuDe(b.belegdatum.slice(0, 10))}</td>
                    <td>
                      {b.beschreibung || <span className="text-slate-400">–</span>}
                      {b.korrekturVon && (
                        <span className="ml-2 text-xs text-amber-700">(Korrektur von Nr. {b.korrekturVon.buchungsnummer})</span>
                      )}
                      <div className="text-xs text-slate-400">
                        {b.positionen.map((p) => `${p.konto.nummer} (${p.steuersatz}%)`).join(", ")}
                      </div>
                    </td>
                    <td className="text-right">
                      {b.typ === "ausgang" ? "−" : "+"}
                      {formatCent(b.betragCent)}
                    </td>
                    <td className="text-right text-slate-600">
                      {formatCent(summeSteuerCent(b.positionen))}
                    </td>
                    <td className="text-right">
                      {!b.storniert && !b.gesperrt && (
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => korrekturStarten(b)} className="text-xs text-blue-700 hover:underline">
                            Korrigieren
                          </button>
                          <button onClick={() => storno(b.id)} className="text-xs text-red-600 hover:underline">
                            Storno
                          </button>
                        </div>
                      )}
                      {b.gesperrt && <span className="text-xs text-slate-400">gesperrt</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          </div>

          {belegVorschau && (
            <aside className="bg-white rounded-lg shadow p-4 w-[440px] shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-auto">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="font-semibold text-blue-900 text-sm truncate" title={belegVorschau.belegnummer}>
                  Beleg: {belegVorschau.belegnummer}
                  {belegVorschau.originalname.includes(".")
                    ? belegVorschau.originalname.slice(belegVorschau.originalname.lastIndexOf("."))
                    : ""}
                </h3>
                <button
                  type="button"
                  onClick={() => setBelegVorschau(null)}
                  className="text-slate-500 hover:text-slate-800 shrink-0"
                  title="Schließen"
                >
                  ✕
                </button>
              </div>
              {belegVorschau.originalname.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={`/api/buchungen/belege/${belegVorschau.id}`}
                  className="w-full h-[75vh] border rounded"
                  title="Belegvorschau"
                />
              ) : (
                <img
                  src={`/api/buchungen/belege/${belegVorschau.id}`}
                  alt="Belegvorschau"
                  className="w-full rounded border"
                />
              )}
              <a
                href={`/api/buchungen/belege/${belegVorschau.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-blue-700 hover:underline"
              >
                In neuem Tab öffnen
              </a>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
