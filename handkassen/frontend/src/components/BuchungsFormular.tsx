import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { euroStringZuCent, formatCent, formatProzent } from "../lib/geld.js";
import BelegErfassung from "./BelegErfassung.js";
import DatumFeld from "./DatumFeld.js";

interface Konto {
  id: number;
  nummer: string;
  bezeichnung: string;
}

interface Steuersatz {
  id: number;
  prozent: number;
  bezeichnung: string;
}

interface Position {
  betrag: string; // Eingabe als Text
  steuersatz: number;
  kontoId: number;
}

// Vorbelegung für den Bearbeiten-Modus (bestehende Buchung direkt ändern)
export interface BearbeitenVorlage {
  buchungId: number;
  buchungsnummer: number;
  belegnummer: string;
  belegdatum: string; // "YYYY-MM-DD"
  typ: "eingang" | "ausgang";
  beschreibung: string;
  hatBeleg: boolean;
  positionen: Position[];
}

interface Props {
  kostenstelleId: number;
  onGespeichert: () => void;
  // Wenn gesetzt, arbeitet das Formular im Bearbeiten-Modus.
  bearbeiten?: BearbeitenVorlage | null;
  // Aufruf, um den Bearbeiten-Modus abzubrechen (zurück zum Neuanlegen).
  onBearbeitenAbbrechen?: () => void;
}

export default function BuchungsFormular({ kostenstelleId, onGespeichert, bearbeiten, onBearbeitenAbbrechen }: Props) {
  const [konten, setKonten] = useState<Konto[]>([]);
  const [steuersaetze, setSteuersaetze] = useState<Steuersatz[]>([]);
  const [belegdatum, setBelegdatum] = useState(new Date().toISOString().slice(0, 10));
  const [typ, setTyp] = useState<"eingang" | "ausgang">("ausgang");
  const [beschreibung, setBeschreibung] = useState("");
  const [positionen, setPositionen] = useState<Position[]>([
    { betrag: "", steuersatz: 20, kontoId: 0 },
  ]);
  const [datei, setDatei] = useState<File | null>(null);
  const [belegReset, setBelegReset] = useState(0); // erhöht sich, um die Beleg-Erfassung zurückzusetzen
  const [fehler, setFehler] = useState<string>("");
  const [erfolg, setErfolg] = useState<string>("");
  const [speichert, setSpeichert] = useState(false);

  const istBearbeiten = !!bearbeiten;

  // Bei Wechsel in den Bearbeiten-Modus: Formular mit den bisherigen Werten vorausfüllen.
  useEffect(() => {
    if (bearbeiten) {
      setBelegdatum(bearbeiten.belegdatum);
      setTyp(bearbeiten.typ);
      setBeschreibung(bearbeiten.beschreibung);
      setPositionen(bearbeiten.positionen.length ? bearbeiten.positionen : [{ betrag: "", steuersatz: 20, kontoId: 0 }]);
      setDatei(null);
      setBelegReset((n) => n + 1);
      setFehler("");
      setErfolg("");
    }
  }, [bearbeiten]);

  useEffect(() => {
    if (!kostenstelleId) { setKonten([]); return; }
    api.get<Konto[]>(`/konten?kostenstelle=${kostenstelleId}`).then(setKonten).catch(() => setKonten([]));
  }, [kostenstelleId]);

  useEffect(() => {
    api.get<Steuersatz[]>("/steuersaetze").then((s) => {
      setSteuersaetze(s);
      // Standard-Steuersatz auf den höchsten verfügbaren setzen (meist 20 %)
      if (s.length) {
        const hoechster = s.reduce((a, b) => (b.prozent > a.prozent ? b : a));
        setPositionen([{ betrag: "", steuersatz: hoechster.prozent, kontoId: 0 }]);
      }
    }).catch(() => {});
  }, []);

  const summeCent = positionen.reduce((s, p) => {
    const c = euroStringZuCent(p.betrag);
    return s + (isNaN(c) ? 0 : c);
  }, 0);

  function positionAendern(i: number, feld: keyof Position, wert: string | number) {
    setPositionen((alt) =>
      alt.map((p, idx) => (idx === i ? { ...p, [feld]: wert } : p))
    );
  }
  const standardSteuersatz = steuersaetze.length
    ? steuersaetze.reduce((a, b) => (b.prozent > a.prozent ? b : a)).prozent
    : 0;

  function positionHinzufuegen() {
    setPositionen((alt) => [...alt, { betrag: "", steuersatz: standardSteuersatz, kontoId: 0 }]);
  }
  function positionEntfernen(i: number) {
    setPositionen((alt) => alt.filter((_, idx) => idx !== i));
  }

  async function speichern() {
    setFehler("");
    // Frontend-seitige Vorprüfung (Server validiert nochmals verbindlich)
    if (positionen.some((p) => !p.kontoId)) {
      setFehler("Bitte für jede Position ein Konto wählen.");
      return;
    }
    if (summeCent <= 0) {
      setFehler("Betrag muss größer als 0 sein.");
      return;
    }

    setSpeichert(true);
    setErfolg("");
    try {
      let belegId: number | undefined;
      if (datei) {
        const r = await api.belegHochladen(datei);
        belegId = r.belegId;
      }
      const nutzdaten = {
        kostenstelleId,
        belegdatum,
        typ,
        beschreibung,
        betragCent: summeCent,
        belegId,
        positionen: positionen.map((p) => ({
          betragCent: euroStringZuCent(p.betrag),
          steuersatz: p.steuersatz,
          kontoId: p.kontoId,
        })),
      };

      if (istBearbeiten && bearbeiten) {
        // Bearbeiten: Buchung wird direkt geändert (Belegnummer bleibt).
        // Ohne neue Datei bleibt der bisherige Beleg erhalten (belegId undefined).
        const neu = await api.put<{ belegnummer: string }>(
          `/buchungen/${bearbeiten.buchungId}`,
          nutzdaten
        );
        setErfolg(`Buchung Nr. ${bearbeiten.buchungsnummer} gespeichert (Belegnummer ${neu.belegnummer}).`);
      } else {
        const buchung = await api.post<{ belegnummer: string }>("/buchungen", nutzdaten);
        setErfolg(
          `Buchung gespeichert. Belegnummer ${buchung.belegnummer} – bitte auf den Papierbeleg schreiben.`
        );
      }

      // zurücksetzen
      setPositionen([{ betrag: "", steuersatz: standardSteuersatz, kontoId: 0 }]);
      setBeschreibung("");
      setDatei(null);
      setBelegReset((n) => n + 1);
      setFehler("");
      onGespeichert();
      if (istBearbeiten && onBearbeitenAbbrechen) onBearbeitenAbbrechen(); // Bearbeiten-Modus verlassen
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h2 className="font-semibold text-marke-900 mb-4">
        {istBearbeiten ? `Buchung bearbeiten (Nr. ${bearbeiten!.buchungsnummer}, Beleg-Nr. ${bearbeiten!.belegnummer})` : "Neue Buchung"}
      </h2>

      {istBearbeiten && (
        <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Änderungen werden direkt an dieser Buchung gespeichert; Buchungs- und Belegnummer bleiben erhalten.
          {bearbeiten!.hatBeleg && " Der vorhandene Beleg bleibt, solange kein neuer gewählt wird."}
        </div>
      )}

      {fehler && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {fehler}
        </div>
      )}

      {erfolg && (
        <div className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2">
          {erfolg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Belegdatum</label>
          <DatumFeld wert={belegdatum} onChange={setBelegdatum} className="w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Typ</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={typ}
            onChange={(e) => setTyp(e.target.value as "eingang" | "ausgang")}
          >
            <option value="ausgang">Ausgang</option>
            <option value="eingang">Eingang</option>
          </select>
        </div>
      </div>

      <label className="block text-sm font-medium mb-1">Beschreibung (optional)</label>
      <input
        className="w-full border rounded px-3 py-2 mb-4"
        value={beschreibung}
        onChange={(e) => setBeschreibung(e.target.value)}
      />

      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Positionen (Split bei mehreren Steuersätzen)</span>
        <button onClick={positionHinzufuegen} className="text-sm text-marke-700 hover:underline">
          + Position
        </button>
      </div>

      <div className="space-y-2 mb-4">
        {positionen.map((p, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input
              className="col-span-3 border rounded px-2 py-1.5 text-right"
              placeholder="0,00"
              value={p.betrag}
              onChange={(e) => positionAendern(i, "betrag", e.target.value)}
            />
            <select
              className="col-span-3 border rounded px-2 py-1.5"
              value={p.steuersatz}
              onChange={(e) => positionAendern(i, "steuersatz", Number(e.target.value))}
            >
              {steuersaetze.map((s) => (
                <option key={s.id} value={s.prozent}>{formatProzent(s.prozent)} %</option>
              ))}
            </select>
            <select
              className="col-span-5 border rounded px-2 py-1.5"
              value={p.kontoId}
              onChange={(e) => positionAendern(i, "kontoId", Number(e.target.value))}
            >
              <option value={0}>Konto wählen…</option>
              {konten.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nummer} – {k.bezeichnung}
                </option>
              ))}
            </select>
            <button
              onClick={() => positionEntfernen(i)}
              disabled={positionen.length === 1}
              className="col-span-1 text-red-600 disabled:text-slate-300"
              title="Entfernen"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1">
          <BelegErfassung key={belegReset} onDatei={setDatei} />
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">Summe</div>
          <div className="text-lg font-semibold">{formatCent(summeCent)}</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={speichern}
          disabled={speichert}
          className="flex-1 bg-marke-700 text-white rounded py-2 font-medium hover:bg-marke-800 disabled:opacity-50"
        >
          {speichert
            ? "Speichert…"
            : istBearbeiten
            ? "Änderungen speichern"
            : "Buchung speichern"}
        </button>
        {istBearbeiten && onBearbeitenAbbrechen && (
          <button
            onClick={onBearbeitenAbbrechen}
            disabled={speichert}
            className="border rounded px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Abbrechen
          </button>
        )}
      </div>
    </div>
  );
}
