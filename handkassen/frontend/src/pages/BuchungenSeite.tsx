import { useEffect, useState } from "react";
import { api, apiUrl } from "../lib/api.js";
import { formatCent, formatProzent, summeSteuerCent } from "../lib/geld.js";
import BuchungsFormular, { type BearbeitenVorlage } from "../components/BuchungsFormular.js";
import { isoZuDe } from "../components/DatumFeld.js";
import { bestaetigen, hinweis } from "../components/dialog.js";
import FreieNummernHinweis from "../components/FreieNummernHinweis.js";

interface Kostenstelle {
  id: number;
  nummer: string;
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
  // Periode wie in der Handkassa II: Jahr und Monat unter der Kostenstelle.
  const heute = new Date();
  const [jahr, setJahr] = useState(heute.getFullYear());
  const [monat, setMonat] = useState(heute.getMonth() + 1);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [freieNummern, setFreieNummern] = useState<string[]>([]);

  // Filter-Zustand (alles im Browser, sofort wirkend)
  const [suche, setSuche] = useState("");
  const [kontoFilter, setKontoFilter] = useState(""); // Kontonummer oder ""
  const [typFilter, setTypFilter] = useState<"" | "eingang" | "ausgang">("");
  const [stornierteZeigen, setStornierteZeigen] = useState(false);

  // Aktive Bearbeiten-Vorlage (wenn gesetzt, arbeitet das Formular im Bearbeiten-Modus)
  const [bearbeiten, setBearbeiten] = useState<BearbeitenVorlage | null>(null);

  // Beleg-Vorschau im rechten Panel (statt in einem neuen Tab)
  const [belegVorschau, setBelegVorschau] = useState<{ id: number; originalname: string; belegnummer: string } | null>(null);

  useEffect(() => {
    api.get<Kostenstelle[]>("/kostenstellen").then((ks) => {
      setKostenstellen(ks);
      if (ks.length && aktiv === null) setAktiv(ks[0].id);
    });
  }, []);

  function ladeBuchungen(ksId: number) {
    setLadeFehler(null);
    api
      .get<Buchung[]>(`/buchungen?kostenstelle=${ksId}`)
      .then(setBuchungen)
      .catch((e) => {
        setBuchungen([]);
        // Nicht stumm scheitern: leere Liste sonst nicht von einem Ladefehler
        // unterscheidbar. Fehler sichtbar melden.
        setLadeFehler(
          e instanceof Error ? e.message : "Buchungen konnten nicht geladen werden.",
        );
      });
  }

  useEffect(() => {
    if (aktiv) ladeBuchungen(aktiv);
  }, [aktiv]);

  function ladeFreieNummern() {
    if (!aktiv) return;
    api
      .get<{ belegnummer: string }[]>(`/buchungen/freie-belegnummern?kostenstelle=${aktiv}&jahr=${jahr}&monat=${monat}`)
      .then((l) => setFreieNummern(l.map((f) => f.belegnummer)))
      .catch(() => setFreieNummern([]));
  }
  // Neu laden bei Periode/Kostenstelle und nach jeder Änderung der Liste.
  useEffect(ladeFreieNummern, [aktiv, jahr, monat, buchungen]);

  const aktuelleKs = kostenstellen.find((k) => k.id === aktiv);

  // Buchungen der gewählten Periode (Belegdatum im gewählten Monat).
  const periode = `${jahr}-${String(monat).padStart(2, "0")}`;
  const imMonat = buchungen.filter((b) => b.belegdatum.slice(0, 7) === periode);

  // Datumsvorschlag: Tag des zuletzt erfassten Belegs dieses Monats; ohne
  // Buchung im laufenden Monat der heutige Tag, sonst kein Vorschlag.
  const letzte = imMonat.reduce<Buchung | null>(
    (a, b) => (!a || b.buchungsnummer > a.buchungsnummer ? b : a),
    null
  );
  const vorschlagTag = letzte
    ? Number(letzte.belegdatum.slice(8, 10))
    : jahr === heute.getFullYear() && monat === heute.getMonth() + 1
    ? heute.getDate()
    : null;

  // Auswahl: einige Jahre zurück und eines voraus.
  const jahre = Array.from({ length: 7 }, (_, i) => heute.getFullYear() - 5 + i);

  function periodeWechseln(j: number, m: number) {
    setJahr(j);
    setMonat(m);
    setBearbeiten(null); // Bearbeiten gilt nur innerhalb der Periode
  }

  // Alle in den Buchungen des Monats vorkommenden Konten (für das Konto-Dropdown)
  const verfuegbareKonten = Array.from(
    new Set(imMonat.flatMap((b) => b.positionen.map((p) => p.konto.nummer)))
  ).sort();

  // Gefilterte Liste (alle Filter werden im Browser kombiniert angewendet)
  const gefiltert = imMonat.filter((b) => {
    if (!stornierteZeigen && b.storniert) return false;
    if (typFilter && b.typ !== typFilter) return false;
    if (kontoFilter && !b.positionen.some((p) => p.konto.nummer === kontoFilter)) return false;

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
    setKontoFilter("");
    setTypFilter("");
    setStornierteZeigen(false);
  }

  async function storno(id: number) {
    if (
      !(await bestaetigen("Diese Buchung stornieren?", {
        titel: "Buchung stornieren",
        bestaetigenText: "Stornieren",
        gefahr: true,
      }))
    )
      return;
    await api
      .post(`/buchungen/${id}/storno`)
      .catch((e) => hinweis((e as Error).message));
    if (aktiv) {
      ladeBuchungen(aktiv);
      api.get<Kostenstelle[]>("/kostenstellen").then(setKostenstellen);
    }
  }

  // Löschen (z. B. doppelt erfasster Beleg): nur in offener Periode. Die
  // Belegnummer wird frei und bei der nächsten Buchung dieses Monats vergeben.
  async function loeschen(b: Buchung) {
    if (
      !(await bestaetigen(
        `Buchung mit Belegnummer ${b.belegnummer.replace(/^\d{4}-/, "")} löschen? Die Nummer wird bei der nächsten Buchung dieses Monats wieder vergeben.`,
        { titel: "Buchung löschen", bestaetigenText: "Löschen", gefahr: true }
      ))
    )
      return;
    try {
      await api.delete(`/buchungen/${b.id}`);
    } catch (e) {
      hinweis((e as Error).message);
    }
    if (bearbeiten?.buchungId === b.id) setBearbeiten(null);
    if (aktiv) {
      ladeBuchungen(aktiv);
      api.get<Kostenstelle[]>("/kostenstellen").then(setKostenstellen);
    }
  }

  // Bearbeiten starten: aus der gewählten Buchung eine Vorlage bauen und das
  // Formular in den Bearbeiten-Modus versetzen. Beträge werden von Cent in den
  // Euro-Eingabetext ("12,50") umgewandelt.
  function bearbeitenStarten(b: Buchung) {
    const vorlage: BearbeitenVorlage = {
      buchungId: b.id,
      buchungsnummer: b.buchungsnummer,
      belegnummer: b.belegnummer,
      belegdatum: b.belegdatum.slice(0, 10),
      typ: b.typ,
      beschreibung: b.beschreibung ?? "",
      hatBeleg: !!b.beleg,
      positionen: b.positionen.map((p) => ({
        betrag: (p.betragCent / 100).toFixed(2).replace(".", ","),
        steuersatz: p.steuersatz,
        kontoId: p.kontoId,
      })),
    };
    setBearbeiten(vorlage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-2 items-center mb-6">
        <label htmlFor="ks-wahl" className="text-sm font-medium">Kostenstelle:</label>
        <select
          id="ks-wahl"
          className="border rounded-sm px-3 py-2 justify-self-start"
          value={aktiv ?? ""}
          onChange={(e) => { setAktiv(Number(e.target.value)); setBearbeiten(null); }}
        >
          {kostenstellen.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nummer} {k.bezeichnung} ({k.bereich.bezeichnung})
            </option>
          ))}
        </select>
        <span className="text-sm text-right">
          {aktuelleKs && (
            <>
              Kassenstand: <span className="font-semibold">{formatCent(aktuelleKs.saldoCent)}</span>
            </>
          )}
        </span>
        <label htmlFor="jahr-wahl" className="text-sm font-medium">Monat:</label>
        <div className="flex gap-2">
          <select
            id="jahr-wahl"
            aria-label="Jahr"
            className="border rounded-sm px-3 py-2"
            value={jahr}
            onChange={(e) => periodeWechseln(Number(e.target.value), monat)}
          >
            {jahre.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
          <select
            aria-label="Monat"
            className="border rounded-sm px-3 py-2"
            value={monat}
            onChange={(e) => periodeWechseln(jahr, Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-6">
        {aktiv && <BuchungsFormular
          kostenstelleId={aktiv}
          jahr={jahr}
          monat={monat}
          vorschlagTag={vorschlagTag}
          bearbeiten={bearbeiten}
          onBearbeitenAbbrechen={() => setBearbeiten(null)}
          onGespeichert={() => {
            ladeBuchungen(aktiv);
            api.get<Kostenstelle[]>("/kostenstellen").then(setKostenstellen);
          }}
        />}

        <div className="flex gap-6 items-start">
          <div className="bg-white rounded-lg shadow-sm p-5 flex-1 min-w-0">
          <h2 className="font-semibold text-marke-900 mb-4">Buchungen {String(monat).padStart(2, "0")}/{jahr}</h2>

          <FreieNummernHinweis nummern={freieNummern} className="mb-4" />

          {/* Filterleiste */}
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-slate-500 mb-1">Suche (Beschreibung, Konto, Nr.)</label>
                <input
                  className="w-full border rounded-sm px-3 py-1.5 text-sm"
                  placeholder="Suchbegriff…"
                  value={suche}
                  onChange={(e) => setSuche(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Konto</label>
                <select className="border rounded-sm px-3 py-1.5 text-sm"
                  value={kontoFilter} onChange={(e) => setKontoFilter(e.target.value)}>
                  <option value="">Alle</option>
                  {verfuegbareKonten.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Typ</label>
                <select className="border rounded-sm px-3 py-1.5 text-sm"
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
              <button onClick={filterZuruecksetzen} className="text-sm text-marke-700 hover:underline">
                Filter zurücksetzen
              </button>
              <span className="ml-auto text-xs text-slate-500">
                {gefiltert.length} von {imMonat.length} Buchungen
              </span>
            </div>
          </div>

          {ladeFehler ? (
            <div className="text-sm text-gefahr-700 bg-gefahr-50 border border-gefahr-600/20 rounded-sm px-3 py-2">
              {ladeFehler}{" "}
              <button
                onClick={() => aktiv && ladeBuchungen(aktiv)}
                className="font-medium underline hover:no-underline"
              >
                Erneut versuchen
              </button>
            </div>
          ) : imMonat.length === 0 ? (
            <p className="text-sm text-slate-500">Noch keine Buchungen in diesem Monat.</p>
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
                  <tr
                    key={b.id}
                    className={`border-b last:border-0 ${b.storniert ? "text-slate-500 line-through" : ""} ${
                      bearbeiten?.buchungId === b.id ? "bg-amber-50" : ""
                    }`}
                  >
                    <td className="py-2">{b.buchungsnummer}</td>
                    <td>{b.belegnummer.replace(/^\d{4}-/, "")}</td>
                    <td>
                      {b.beleg ? (
                        <button
                          type="button"
                          onClick={() => setBelegVorschau({ id: b.beleg!.id, originalname: b.beleg!.originalname, belegnummer: b.belegnummer })}
                          className={belegVorschau?.id === b.beleg.id ? "text-marke-900" : "text-marke-700 hover:text-marke-900"}
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
                        <span className="text-slate-500">–</span>
                      )}
                    </td>
                    <td>{isoZuDe(b.belegdatum.slice(0, 10))}</td>
                    <td>
                      {b.beschreibung || <span className="text-slate-500">–</span>}
                      {b.korrekturVon && (
                        <span className="ml-2 text-xs text-amber-700">(Korrektur von Nr. {b.korrekturVon.buchungsnummer})</span>
                      )}
                      <div className="text-xs text-slate-500">
                        {b.positionen.map((p) => `${p.konto.nummer} (${formatProzent(p.steuersatz)}%)`).join(", ")}
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
                          <button onClick={() => bearbeitenStarten(b)} className="text-xs text-marke-700 hover:underline">
                            Bearbeiten
                          </button>
                          <button onClick={() => storno(b.id)} className="text-xs text-red-600 hover:underline">
                            Storno
                          </button>
                          <button onClick={() => loeschen(b)} className="text-xs text-red-600 hover:underline">
                            Löschen
                          </button>
                        </div>
                      )}
                      {b.gesperrt && <span className="text-xs text-slate-500">gesperrt</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          </div>

          {belegVorschau && (
            <aside className="bg-white rounded-lg shadow-sm p-4 w-[440px] shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-auto">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="font-semibold text-marke-900 text-sm truncate" title={belegVorschau.belegnummer}>
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
                  src={apiUrl(`/buchungen/belege/${belegVorschau.id}`)}
                  className="w-full h-[75vh] border rounded-sm"
                  title="Belegvorschau"
                />
              ) : (
                <img
                  src={apiUrl(`/buchungen/belege/${belegVorschau.id}`)}
                  alt="Belegvorschau"
                  className="w-full rounded-sm border"
                />
              )}
              <a
                href={apiUrl(`/buchungen/belege/${belegVorschau.id}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-marke-700 hover:underline"
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
