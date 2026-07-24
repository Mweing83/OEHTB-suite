import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { MitarbeiterListe } from "../lib/typen";
import Layout from "../components/Layout";
import { hinweis } from "../components/dialog";

// Datum DD/MM/YYYY (europaeisches Layout) fuer die Anzeige.
function datumDe(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}/${m}/${j}`;
}

// Kleine Statusanzeige fuer den Verarbeitungsstand.
function VerrechnungBadge({
  status,
}: {
  status: "VERARBEITET" | "OFFEN" | null;
}) {
  if (status === "VERARBEITET") {
    return (
      <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 rounded px-2 py-0.5 text-xs">
        verarbeitet
      </span>
    );
  }
  if (status === "OFFEN") {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 rounded px-2 py-0.5 text-xs">
        offen
      </span>
    );
  }
  // null = manuell erfasst, kein Verrechnungsstatus
  return <span className="text-gray-300 text-xs">–</span>;
}

// Zahl mit einer Nachkommastelle im deutschen Format (z. B. 12,5).
function fmt1(n: number): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// Vorzeichenbehaftete FTE-Differenz (z. B. +1,5 / -0,5).
function mitVorzeichen(n: number): string {
  return (n >= 0 ? "+" : "") + fmt1(n);
}

const MONATE_NAMEN = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// Laedt eine geschuetzte Datei (mit Session-Cookie) herunter.
async function csvHerunterladen(pfad: string, dateiname: string): Promise<void> {
  try {
    const res = await fetch(pfad, { credentials: "include" });
    if (!res.ok) {
      await hinweis("Export fehlgeschlagen.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    await hinweis("Export fehlgeschlagen.");
  }
}

// Einzelne Kennzahl-Karte fuer die Analyse-Leiste.
function StatKarte({
  label,
  wert,
  sub,
}: {
  label: string;
  wert: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-gray-800 mt-0.5">{wert}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function DashboardSeite() {
  const { benutzer } = useAuth();
  // Massenexporte sind serverseitig fuer "leser" gesperrt - Buttons dann ausblenden.
  const darfExportieren = benutzer != null && benutzer.rolle !== "leser";
  const [liste, setListe] = useState<MitarbeiterListe[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [bereich, setBereich] = useState("");

  // Auswaehlbare Monate fuer den Stichtags-Export: aktueller + 23 vorige Monate.
  const monatsOptionen = useMemo(() => {
    const jetzt = new Date();
    const opts: { wert: string; label: string }[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(jetzt.getFullYear(), jetzt.getMonth() - i, 1);
      const wert = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      opts.push({ wert, label: `${MONATE_NAMEN[d.getMonth()]} ${d.getFullYear()}` });
    }
    return opts;
  }, []);
  const [monat, setMonat] = useState(monatsOptionen[0].wert);

  useEffect(() => {
    api
      .get<MitarbeiterListe[]>("/api/mitarbeiter")
      .then(setListe)
      .catch((e) => setFehler(e instanceof Error ? e.message : "Fehler"))
      .finally(() => setLaedt(false));
  }, []);

  // Verfuegbare Bereiche fuer den Filter.
  const bereiche = useMemo(() => {
    const set = new Set<string>();
    liste.forEach((m) => m.bereich && set.add(m.bereich));
    return Array.from(set).sort();
  }, [liste]);

  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return liste.filter((m) => {
      const passtBereich = !bereich || m.bereich === bereich;
      const passtSuche =
        !s ||
        `${m.vorname} ${m.nachname}`.toLowerCase().includes(s) ||
        m.personalnummer.toLowerCase().includes(s);
      return passtBereich && passtSuche;
    });
  }, [liste, suche, bereich]);

  // Kennzahlen IMMER organisationsweit (ueber die gesamte aktive Liste,
  // unabhaengig von Suche/Bereichsfilter). FTE = Summe der Ausmass-% / 100.
  const analytik = useMemo(() => {
    let fteProzentSumme = 0;
    let wochenstundenSumme = 0;
    let vollzeit = 0;
    let teilzeit = 0;
    let ohneDaten = 0;
    let anstehende = 0;
    let nettoDeltaProzent = 0;
    const proBereich = new Map<
      string,
      { headcount: number; fteProzent: number }
    >();

    for (const m of liste) {
      const schluessel = m.bereich ?? "Ohne Bereich";
      const b = proBereich.get(schluessel) ?? { headcount: 0, fteProzent: 0 };
      b.headcount += 1;

      if (m.aktuellerStand) {
        const p = m.aktuellerStand.ausmassProzent;
        fteProzentSumme += p;
        wochenstundenSumme += m.aktuellerStand.wochenstunden;
        b.fteProzent += p;
        if (p >= 100) vollzeit += 1;
        else teilzeit += 1;
      } else {
        ohneDaten += 1;
      }

      if (m.naechsteAenderung) {
        anstehende += 1;
        const aktuell = m.aktuellerStand?.ausmassProzent ?? 0;
        nettoDeltaProzent += m.naechsteAenderung.ausmassProzent - aktuell;
      }

      proBereich.set(schluessel, b);
    }

    return {
      headcount: liste.length,
      fte: fteProzentSumme / 100,
      wochenstundenSumme,
      vollzeit,
      teilzeit,
      ohneDaten,
      anstehende,
      nettoFteDelta: nettoDeltaProzent / 100,
      proBereich: Array.from(proBereich.entries())
        .map(([name, v]) => ({
          name,
          headcount: v.headcount,
          fte: v.fteProzent / 100,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [liste]);

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Dashboard</h2>
        <div className="flex gap-2">
          <input
            placeholder="Suche Name / Personalnr."
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
          <select
            value={bereich}
            onChange={(e) => setBereich(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            <option value="">Alle Bereiche</option>
            {bereiche.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {darfExportieren && (
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm text-gray-500">Export:</span>
        <button
          onClick={() =>
            csvHerunterladen(
              "/api/mitarbeiter/export/aktuell",
              "stand_aktuell.csv"
            )
          }
          className="text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-700 hover:bg-gray-50"
          title="Aktuellen Stand aller aktiven Mitarbeiter als CSV (Excel)"
        >
          Aktueller Stand (CSV)
        </button>
        <span className="text-gray-300">|</span>
        <select
          value={monat}
          onChange={(e) => setMonat(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          title="Monat für den historischen Stichtag"
        >
          {monatsOptionen.map((o) => (
            <option key={o.wert} value={o.wert}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            csvHerunterladen(
              `/api/mitarbeiter/export/stichtag?monat=${monat}`,
              `stand_${monat}.csv`
            )
          }
          className="text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-700 hover:bg-gray-50"
          title="Stand aller Mitarbeiter zum Monatsende als CSV (Excel)"
        >
          Monats-Stand (CSV)
        </button>
      </div>
      )}

      {laedt && <p className="text-gray-500">Lädt …</p>}
      {fehler && <p className="text-red-600">{fehler}</p>}

      {!laedt && !fehler && (
        <div className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatKarte
              label="Mitarbeiter"
              wert={String(analytik.headcount)}
              sub="aktiv"
            />
            <StatKarte
              label="FTE"
              wert={fmt1(analytik.fte)}
              sub="auf Basis 100 %"
            />
            <StatKarte
              label="Wochenstunden"
              wert={fmt1(analytik.wochenstundenSumme)}
              sub="gesamt"
            />
            <StatKarte
              label="Vollzeit / Teilzeit"
              wert={`${analytik.vollzeit} / ${analytik.teilzeit}`}
              sub="100 % / < 100 %"
            />
            <StatKarte
              label="Anstehende Änderungen"
              wert={String(analytik.anstehende)}
              sub={
                analytik.anstehende > 0
                  ? `${mitVorzeichen(analytik.nettoFteDelta)} FTE`
                  : "keine"
              }
            />
          </div>

          {analytik.ohneDaten > 0 && (
            <p className="text-xs text-slate-500 mt-2">
              Hinweis: {analytik.ohneDaten} Mitarbeiter ohne aktuelle
              Beschäftigungsdaten (nicht in FTE/Wochenstunden enthalten).
            </p>
          )}

          {analytik.proBereich.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-4 mt-3">
              <div className="text-xs font-medium text-gray-500 mb-2">
                Nach Bereich
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {analytik.proBereich.map((b) => (
                  <div
                    key={b.name}
                    className="border border-gray-100 rounded px-3 py-2"
                  >
                    <div className="font-medium text-gray-700">{b.name}</div>
                    <div className="text-gray-500 text-xs mt-0.5">
                      {b.headcount} MA · {fmt1(b.fte)} FTE
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!laedt && !fehler && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Personalnr.</th>
                <th className="px-4 py-3 font-medium">Bereich</th>
                <th className="px-4 py-3 font-medium text-right">
                  Wochenstunden
                </th>
                <th className="px-4 py-3 font-medium text-right">Ausmaß</th>
                <th className="px-4 py-3 font-medium">Anstehende Änderung</th>
                <th className="px-4 py-3 font-medium">Verrechnung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {gefiltert.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/mitarbeiter/${m.id}`}
                      className="text-marke-600 hover:underline font-medium"
                    >
                      {m.nachname}, {m.vorname}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.personalnummer}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.bereich ?? "–"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.aktuellerStand
                      ? m.aktuellerStand.wochenstunden.toLocaleString("de-DE")
                      : "–"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.aktuellerStand
                      ? `${m.aktuellerStand.ausmassProzent.toLocaleString(
                          "de-DE"
                        )} %`
                      : "–"}
                  </td>
                  <td className="px-4 py-3">
                    {m.naechsteAenderung ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 rounded px-2 py-0.5 text-xs">
                        ab {datumDe(m.naechsteAenderung.gueltigAb)}:{" "}
                        {m.naechsteAenderung.wochenstunden.toLocaleString(
                          "de-DE"
                        )}{" "}
                        Std
                      </span>
                    ) : (
                      <span className="text-slate-500 text-xs">–</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <VerrechnungBadge
                      status={
                        (m.naechsteAenderung ?? m.aktuellerStand)
                          ?.verarbeitungStatus ?? null
                      }
                    />
                  </td>
                </tr>
              ))}
              {gefiltert.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    Keine Mitarbeiter gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
