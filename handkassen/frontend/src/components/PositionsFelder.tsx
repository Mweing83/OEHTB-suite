import { formatProzent } from "../lib/geld.js";
import { betragCent, type Position, type Typ } from "../lib/splitbuchung.js";

export interface Konto {
  id: number;
  nummer: string;
  bezeichnung: string;
  fixSteuersatz: number | null; // z. B. 0 bei Dotationen; null = frei wählbar
}

export interface Steuersatz {
  id: number;
  prozent: number;
  bezeichnung: string;
}

// Einheitliches Aussehen der Formularfelder; `fehlt` markiert ein offenes Pflichtfeld.
export const feldKlasse = (fehlt: boolean) =>
  `w-full border rounded-sm px-3 py-2 ${fehlt ? "border-amber-400" : ""} disabled:bg-slate-100 disabled:text-slate-600`;

interface Props {
  position: Position;
  index: number;
  // Splitbuchung: zusätzlich Art und Beschreibung je Zeile, Überschriften nur über der ersten Zeile.
  split: boolean;
  buchungsTyp: Typ;
  konten: Konto[];
  steuersaetze: Steuersatz[];
  // Fehlende Pflichtfelder erst nach einem Speicherversuch markieren.
  versucht: boolean;
  onAendern: (aenderung: Partial<Position>) => void;
}

// Felder einer Buchungszeile: Konto, Betrag, Steuersatz – bei Splitbuchung
// zusätzlich Art (Ausgabe/Einnahme) und Beschreibung. Die data-feld-Attribute
// steuern die Enter-Navigation des Buchungsformulars.
export default function PositionsFelder({
  position: p,
  index: i,
  split,
  buchungsTyp,
  konten,
  steuersaetze,
  versucht,
  onAendern,
}: Props) {
  const fix = konten.find((k) => k.id === p.kontoId)?.fixSteuersatz;
  const mitLabel = !split || i === 0;

  // Konto gewählt: fixer Steuersatz wird übernommen, sonst muss er neu gewählt werden.
  function kontoWaehlen(kontoId: number) {
    onAendern({ kontoId, steuersatz: konten.find((k) => k.id === kontoId)?.fixSteuersatz ?? null });
  }

  // Steuersatz-Auswahl; ein inzwischen inaktiver Satz (Bearbeiten) bleibt sichtbar.
  const saetze = [...steuersaetze];
  if (p.steuersatz != null && !saetze.some((s) => s.prozent === p.steuersatz)) {
    saetze.push({ id: -1, prozent: p.steuersatz, bezeichnung: "" });
  }

  return (
    <>
      {split && (
        <div className="col-span-2">
          {i === 0 && <label className="block text-sm font-medium mb-1">Art *</label>}
          <select
            data-feld={`pos-typ-${i}`}
            className={feldKlasse(false)}
            value={p.typ ?? buchungsTyp}
            onChange={(e) => onAendern({ typ: e.target.value as Typ })}
          >
            <option value="ausgang">Ausgabe</option>
            <option value="eingang">Einnahme</option>
          </select>
        </div>
      )}
      <div className={split ? "col-span-3" : "col-span-6"}>
        {mitLabel && <label className="block text-sm font-medium mb-1">Konto *</label>}
        <select
          data-feld={`pos-konto-${i}`}
          className={feldKlasse(versucht && !p.kontoId)}
          value={p.kontoId}
          onChange={(e) => kontoWaehlen(Number(e.target.value))}
        >
          <option value={0}>Konto wählen…</option>
          {konten.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nummer} – {k.bezeichnung}
            </option>
          ))}
        </select>
      </div>
      <div className={split ? "col-span-2" : "col-span-3"}>
        {mitLabel && <label className="block text-sm font-medium mb-1">Betrag (brutto) *</label>}
        <input
          data-feld={`pos-betrag-${i}`}
          inputMode="decimal"
          className={`${feldKlasse(versucht && betragCent(p.betrag) == null)} text-right`}
          placeholder="0,00"
          value={p.betrag}
          onChange={(e) => onAendern({ betrag: e.target.value })}
        />
      </div>
      <div className={split ? "col-span-2" : "col-span-3"}>
        {mitLabel && <label className="block text-sm font-medium mb-1">Steuersatz *</label>}
        <select
          data-feld={`pos-steuer-${i}`}
          className={feldKlasse(versucht && p.steuersatz == null)}
          value={p.steuersatz == null ? "" : String(p.steuersatz)}
          disabled={fix != null}
          title={fix != null ? "Fixer Steuersatz dieses Kontos" : undefined}
          onChange={(e) => onAendern({ steuersatz: e.target.value === "" ? null : Number(e.target.value) })}
        >
          <option value="">wählen…</option>
          {saetze.map((s) => (
            <option key={s.id} value={String(s.prozent)}>{formatProzent(s.prozent)} %</option>
          ))}
        </select>
      </div>
      {split && (
        <div className="col-span-2">
          {i === 0 && <label className="block text-sm font-medium mb-1">Beschreibung *</label>}
          <input
            data-feld={`pos-text-${i}`}
            className={feldKlasse(versucht && !p.text.trim())}
            placeholder="z. B. Lebensmittel"
            value={p.text}
            onChange={(e) => onAendern({ text: e.target.value })}
          />
        </div>
      )}
    </>
  );
}
