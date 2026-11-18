import { useState, FormEvent } from "react";
import { api } from "../lib/api";
import { MitarbeiterListe } from "../lib/typen";
import DatumEingabe from "./DatumEingabe";

interface Props {
  // null = neue Person anlegen, sonst die Person, deren Stammdaten bearbeitet
  // werden. Beim Wechsel der Person das Formular über `key` neu aufbauen.
  mitarbeiter: Pick<
    MitarbeiterListe,
    "id" | "vorname" | "nachname" | "personalnummer" | "email" | "bereich" | "austrittAm"
  > | null;
  onGespeichert: () => void;
  onAbbrechen: () => void;
  className?: string;
}

const feld = "w-full border border-gray-300 rounded-sm px-3 py-2 text-sm";

// Stammdaten-Formular eines Mitarbeiters – dasselbe für Anlegen (Liste) und
// Bearbeiten (Liste und Detailseite).
export default function MitarbeiterFormular({ mitarbeiter, onGespeichert, onAbbrechen, className = "" }: Props) {
  const [vorname, setVorname] = useState(mitarbeiter?.vorname ?? "");
  const [nachname, setNachname] = useState(mitarbeiter?.nachname ?? "");
  const [personalnummer, setPersonalnummer] = useState(mitarbeiter?.personalnummer ?? "");
  const [email, setEmail] = useState(mitarbeiter?.email ?? "");
  const [bereich, setBereich] = useState(mitarbeiter?.bereich ?? "");
  const [austrittAm, setAustrittAm] = useState(mitarbeiter?.austrittAm ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    const daten = {
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      personalnummer: personalnummer.trim(),
      email: email.trim(),
      bereich: bereich.trim(),
    };
    if (!daten.vorname || !daten.nachname || !daten.personalnummer) {
      setFehler("Vorname, Nachname und Personalnummer sind erforderlich.");
      return;
    }
    setSpeichert(true);
    try {
      if (mitarbeiter) {
        // Austrittsdatum nur beim Bearbeiten (neue Mitarbeiter sind aktiv).
        await api.put(`/api/mitarbeiter/${mitarbeiter.id}`, { ...daten, austrittAm });
      } else {
        await api.post("/api/mitarbeiter", daten);
      }
      onGespeichert();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <form onSubmit={speichern} className={"grid grid-cols-2 gap-4 " + className}>
      <div>
        <label className="block text-sm text-gray-700 mb-1">Vorname</label>
        <input value={vorname} onChange={(e) => setVorname(e.target.value)} required className={feld} />
      </div>
      <div>
        <label className="block text-sm text-gray-700 mb-1">Nachname</label>
        <input value={nachname} onChange={(e) => setNachname(e.target.value)} required className={feld} />
      </div>
      <div>
        <label className="block text-sm text-gray-700 mb-1">Personalnummer</label>
        <input
          value={personalnummer}
          onChange={(e) => setPersonalnummer(e.target.value)}
          required
          className={feld}
        />
      </div>
      <div>
        <label className="block text-sm text-gray-700 mb-1">Bereich (z. B. VBW)</label>
        <input value={bereich} onChange={(e) => setBereich(e.target.value)} className={feld} />
      </div>
      <div className="col-span-2">
        <label className="block text-sm text-gray-700 mb-1">E-Mail (optional)</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={feld} />
      </div>

      {mitarbeiter && (
        <div className="col-span-2">
          <label className="block text-sm text-gray-700 mb-1">Austrittsdatum (optional)</label>
          <DatumEingabe value={austrittAm} onChange={setAustrittAm} className={feld} />
          <p className="text-xs text-slate-500 mt-1">
            Leer = beschäftigt. Ab diesem Tag zählt die Person nicht mehr zum
            aktuellen Stand und wird in Stichtags-Exporten danach ausgeblendet.
          </p>
        </div>
      )}

      {fehler && <p className="col-span-2 text-sm text-red-600">{fehler}</p>}

      <div className="col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={speichert}
          className="bg-marke-600 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          {speichert ? "Speichern …" : mitarbeiter ? "Änderungen speichern" : "Anlegen"}
        </button>
        <button
          type="button"
          onClick={onAbbrechen}
          className="border border-gray-300 rounded-sm px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}
