import { FormEvent, useState } from "react";
import { Foerderquelle, Ebene, Kategorie, EBENE_LABEL, KATEGORIE_LABEL } from "../lib/typen";

// Eingaben des Formulars; leere Textfelder kommen als "".
export interface QuelleWerte {
  name: string;
  traeger: string;
  ebene: Ebene;
  kategorie: Kategorie;
  themen: string[];
  webseite: string;
  kontakt: string;
  beschreibung: string;
}

interface Props {
  // Vorbelegung beim Bearbeiten; ohne Quelle ein leeres Formular (Anlegen).
  // Nach einem Neuladen der Quelle das Formular über `key` neu aufbauen.
  quelle?: Foerderquelle;
  knopfText: string;
  onSpeichern: (werte: QuelleWerte) => void;
  className?: string;
}

const eingabeKlasse =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-marke-500";

// Stammdaten einer Förderquelle – dasselbe Formular für Anlegen
// (Förderlandschaft) und Bearbeiten (Detailseite). Gespeichert wird von der
// aufrufenden Seite (onSpeichern), die auch Fehler und Meldungen anzeigt.
export default function QuelleFormular({ quelle, knopfText, onSpeichern, className = "" }: Props) {
  const [name, setName] = useState(quelle?.name ?? "");
  const [traeger, setTraeger] = useState(quelle?.traeger ?? "");
  const [ebene, setEbene] = useState<Ebene>(quelle?.ebene ?? "BUND");
  const [kategorie, setKategorie] = useState<Kategorie>(quelle?.kategorie ?? "PROJEKT");
  const [themen, setThemen] = useState(quelle?.themen.join(", ") ?? "");
  const [webseite, setWebseite] = useState(quelle?.webseite ?? "");
  const [kontakt, setKontakt] = useState(quelle?.kontakt ?? "");
  const [beschreibung, setBeschreibung] = useState(quelle?.beschreibung ?? "");

  function absenden(e: FormEvent) {
    e.preventDefault();
    onSpeichern({
      name,
      traeger,
      ebene,
      kategorie,
      themen: themen.split(",").map((t) => t.trim()).filter(Boolean),
      webseite: webseite.trim(),
      kontakt: kontakt.trim(),
      beschreibung,
    });
  }

  return (
    <form
      onSubmit={absenden}
      className={"bg-white rounded-lg shadow-xs border border-gray-200 p-4 grid gap-3 sm:grid-cols-2 " + className}
    >
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={eingabeKlasse} />
      <input required value={traeger} onChange={(e) => setTraeger(e.target.value)} placeholder="Träger" className={eingabeKlasse} />
      <select value={ebene} onChange={(e) => setEbene(e.target.value as Ebene)} className={eingabeKlasse} aria-label="Ebene">
        {Object.entries(EBENE_LABEL).map(([w, l]) => (
          <option key={w} value={w}>{l}</option>
        ))}
      </select>
      <select value={kategorie} onChange={(e) => setKategorie(e.target.value as Kategorie)} className={eingabeKlasse} aria-label="Kategorie">
        {Object.entries(KATEGORIE_LABEL).map(([w, l]) => (
          <option key={w} value={w}>{l}</option>
        ))}
      </select>
      <input value={themen} onChange={(e) => setThemen(e.target.value)} placeholder="Themen (kommagetrennt)" className={eingabeKlasse} />
      <input value={webseite} onChange={(e) => setWebseite(e.target.value)} placeholder="Webseite (https://…)" className={eingabeKlasse} />
      <input value={kontakt} onChange={(e) => setKontakt(e.target.value)} placeholder="Kontakt" className={eingabeKlasse} />
      <textarea value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Beschreibung" className={eingabeKlasse + " sm:col-span-2"} rows={3} />
      <div className="sm:col-span-2">
        <button type="submit" className="rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700">
          {knopfText}
        </button>
      </div>
    </form>
  );
}
