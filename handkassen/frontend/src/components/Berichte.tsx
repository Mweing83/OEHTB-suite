import { useState } from "react";
import { useAuth } from "../lib/auth.js";
import { apiUrl } from "../lib/api.js";
import DatumFeld from "./DatumFeld.js";

interface Props {
  kostenstelleId: number;
}

// Bietet die drei PDF-Berichte für die gewählte Kostenstelle an.
// Zwei Modi: nach Monat ODER frei wählbarer Zeitraum (von/bis).
export default function Berichte({ kostenstelleId }: Props) {
  const { benutzer } = useAuth();
  const darfBmd = benutzer?.rolle === "finanzen" || benutzer?.rolle === "admin";
  const heute = new Date();
  const [modus, setModus] = useState<"monat" | "zeitraum">("monat");
  const [jahr, setJahr] = useState(heute.getFullYear());
  const [monat, setMonat] = useState(heute.getMonth() + 1);
  const [von, setVon] = useState(new Date(heute.getFullYear(), heute.getMonth(), 1).toISOString().slice(0, 10));
  const [bis, setBis] = useState(heute.toISOString().slice(0, 10));

  function url(bericht: "kassabericht" | "detailbericht" | "zaehlliste" | "csv"): string {
    const basis = apiUrl(`/berichte/${bericht}?kostenstelle=${kostenstelleId}`);
    if (modus === "monat") {
      return `${basis}&jahr=${jahr}&monat=${monat}`;
    }
    return `${basis}&von=${von}&bis=${bis}`;
  }

  function oeffnen(bericht: "kassabericht" | "detailbericht" | "zaehlliste") {
    window.open(url(bericht), "_blank", "noopener,noreferrer");
  }

  // CSV wird heruntergeladen (nicht im Tab geöffnet). Ein temporärer Link mit
  // download-Attribut nutzt den vom Server gesetzten Dateinamen.
  function csvHerunterladen() {
    const a = document.createElement("a");
    a.href = url("csv");
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // BMD-Export bezieht sich auf ALLE Kostenstellen eines Monats (nicht auf eine einzelne).
  // Daher eigene Jahr/Monat-Auswahl, unabhängig von der Auswahl oben.
  const [bmdJahr, setBmdJahr] = useState(heute.getFullYear());
  const [bmdMonat, setBmdMonat] = useState(heute.getMonth() + 1);

  function bmdExport() {
    const u = apiUrl(`/export/bmd?jahr=${bmdJahr}&monat=${bmdMonat}`);
    window.open(u, "_blank", "noopener,noreferrer");
  }

  // CSV über alle Kassen des gewählten Monats herunterladen.
  function csvAlleHerunterladen() {
    const a = document.createElement("a");
    a.href = apiUrl(`/export/csv?jahr=${bmdJahr}&monat=${bmdMonat}`);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <h2 className="font-semibold text-marke-900 mb-4">Berichte</h2>

      {/* Modus-Umschaltung */}
      <div className="flex gap-4 mb-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={modus === "monat"} onChange={() => setModus("monat")} />
          Nach Monat
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={modus === "zeitraum"} onChange={() => setModus("zeitraum")} />
          Zeitraum
        </label>
      </div>

      {modus === "monat" ? (
        <div className="grid grid-cols-2 gap-4 mb-4 max-w-xs">
          <div>
            <label className="block text-sm font-medium mb-1">Jahr</label>
            <input type="number" className="w-full border rounded-sm px-3 py-2"
              value={jahr} onChange={(e) => setJahr(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Monat</label>
            <input type="number" min={1} max={12} className="w-full border rounded-sm px-3 py-2"
              value={monat} onChange={(e) => setMonat(Number(e.target.value))} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 mb-4 max-w-md">
          <div>
            <label className="block text-sm font-medium mb-1">Von</label>
            <DatumFeld className="w-full" wert={von} onChange={setVon} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bis</label>
            <DatumFeld className="w-full" wert={bis} onChange={setBis} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button onClick={() => oeffnen("kassabericht")}
          className="bg-marke-700 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-800">
          Kassabericht
        </button>
        <button onClick={() => oeffnen("detailbericht")}
          className="bg-marke-700 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-800">
          Detailbericht
        </button>
        <button onClick={() => oeffnen("zaehlliste")}
          className="bg-marke-700 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-800">
          Zählliste
        </button>
        <button onClick={csvHerunterladen}
          className="bg-green-700 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-green-800">
          CSV (Excel)
        </button>
      </div>

      <p className="text-xs text-slate-500 mt-3">
        Kassabericht, Detailbericht und Zählliste öffnen sich als PDF in einem neuen Tab.
        „CSV (Excel)“ lädt die Buchungen des gewählten Zeitraums als Tabelle für Excel herunter.
      </p>

      {/* BMD-Export (Buchhaltung) – nur für Finanzen/Admin sichtbar */}
      {darfBmd && (
        <div className="mt-6 pt-4 border-t">
          <h3 className="font-semibold text-marke-900 mb-1">Export über alle Kassen (Buchhaltung)</h3>
          <p className="text-xs text-slate-500 mb-3">
            Für den gewählten Monat über <strong>alle</strong> Kostenstellen:
            die Buchungssatz-Datei (.txt) für den BMD-Import oder eine CSV-Tabelle (Excel).
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Jahr</label>
              <input type="number" className="border rounded-sm px-3 py-2 w-28"
                value={bmdJahr} onChange={(e) => setBmdJahr(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Monat</label>
              <input type="number" min={1} max={12} className="border rounded-sm px-3 py-2 w-24"
                value={bmdMonat} onChange={(e) => setBmdMonat(Number(e.target.value))} />
            </div>
            <button onClick={bmdExport}
              className="bg-slate-700 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-slate-800">
              BMD-Datei herunterladen
            </button>
            <button onClick={csvAlleHerunterladen}
              className="bg-green-700 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-green-800">
              CSV (alle Kassen)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
