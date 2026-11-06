import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api } from "../lib/api.js";
import { euroStringZuCent, formatCent, formatProzent } from "../lib/geld.js";
import BelegErfassung from "./BelegErfassung.js";

interface Konto {
  id: number;
  nummer: string;
  bezeichnung: string;
  fixSteuersatz: number | null; // z. B. 0 bei Dotationen; null = frei wählbar
}

interface Steuersatz {
  id: number;
  prozent: number;
  bezeichnung: string;
}

interface Position {
  betrag: string; // Eingabe als Text ("12,50")
  steuersatz: number | null; // null = noch nicht gewählt (kein Vorschlag)
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
  positionen: { betrag: string; steuersatz: number; kontoId: number }[];
}

interface Props {
  kostenstelleId: number;
  // Gewählte Periode (Auswahl oben auf der Seite): das Datum ergibt sich aus
  // Jahr/Monat + eingegebenem Tag, andere Monate sind nicht erfassbar.
  jahr: number;
  monat: number;
  // Tag des vorherigen Belegs in diesem Monat (Vorschlag für das Datum).
  vorschlagTag: number | null;
  onGespeichert: () => void;
  // Wenn gesetzt, arbeitet das Formular im Bearbeiten-Modus.
  bearbeiten?: BearbeitenVorlage | null;
  // Aufruf, um den Bearbeiten-Modus abzubrechen (zurück zum Neuanlegen).
  onBearbeitenAbbrechen?: () => void;
}

const LEER: Position = { betrag: "", steuersatz: null, kontoId: 0 };

function zweistellig(n: number): string {
  return String(n).padStart(2, "0");
}

function centZuEingabe(cent: number): string {
  return (cent / 100).toFixed(2).replace(".", ",");
}

// Betrag gültig, wenn positiv und höchstens zwei Nachkommastellen.
function betragCent(text: string): number | null {
  if (!/^\d+([.,]\d{1,2})?$/.test(text.trim())) return null;
  const c = euroStringZuCent(text);
  return isNaN(c) || c <= 0 ? null : c;
}

const feldKlasse = (fehlt: boolean) =>
  `w-full border rounded-sm px-3 py-2 ${fehlt ? "border-amber-400" : ""} disabled:bg-slate-100 disabled:text-slate-600`;

export default function BuchungsFormular({
  kostenstelleId,
  jahr,
  monat,
  vorschlagTag,
  onGespeichert,
  bearbeiten,
  onBearbeitenAbbrechen,
}: Props) {
  const [konten, setKonten] = useState<Konto[]>([]);
  const [steuersaetze, setSteuersaetze] = useState<Steuersatz[]>([]);
  const [tag, setTag] = useState("");
  const [typ, setTyp] = useState<"eingang" | "ausgang">("ausgang");
  const [split, setSplit] = useState(false);
  const [gesamt, setGesamt] = useState(""); // nur bei Splitbuchung
  const [positionen, setPositionen] = useState<Position[]>([{ ...LEER }]);
  const [beschreibung, setBeschreibung] = useState("");
  const [datei, setDatei] = useState<File | null>(null);
  const [belegReset, setBelegReset] = useState(0); // erhöht sich, um die Beleg-Erfassung zurückzusetzen
  const [vorschauNr, setVorschauNr] = useState("");
  const [vorschauNeu, setVorschauNeu] = useState(0);
  const [fehler, setFehler] = useState<string>("");
  const [erfolg, setErfolg] = useState<string>("");
  const [speichert, setSpeichert] = useState(false);
  const [versucht, setVersucht] = useState(false); // fehlende Felder erst nach Speicherversuch markieren
  const wurzel = useRef<HTMLDivElement>(null);
  // Nach dem Anlegen einer Split-Position deren Konto-Feld fokussieren.
  const fokusNachRender = useRef<string | null>(null);

  const istBearbeiten = !!bearbeiten;
  const tageImMonat = new Date(jahr, monat, 0).getDate();

  // Bei Wechsel in den Bearbeiten-Modus: Formular mit den bisherigen Werten vorausfüllen.
  useEffect(() => {
    if (!bearbeiten) return;
    setTag(String(Number(bearbeiten.belegdatum.slice(8, 10))));
    setTyp(bearbeiten.typ);
    setBeschreibung(bearbeiten.beschreibung);
    const pos = bearbeiten.positionen.length ? bearbeiten.positionen : [{ ...LEER }];
    setPositionen(pos);
    setSplit(pos.length > 1);
    setGesamt(centZuEingabe(pos.reduce((s, p) => s + (betragCent(p.betrag) ?? 0), 0)));
    setDatei(null);
    setBelegReset((n) => n + 1);
    setFehler("");
    setErfolg("");
    setVersucht(false);
  }, [bearbeiten]);

  // Vorschlag: Datum des vorherigen Belegs (bei neuer Periode bzw. nach dem Laden).
  useEffect(() => {
    if (bearbeiten) return;
    setTag(vorschlagTag ? String(vorschlagTag) : "");
  }, [vorschlagTag, jahr, monat, kostenstelleId, bearbeiten]);

  useEffect(() => {
    if (!kostenstelleId) { setKonten([]); return; }
    api.get<Konto[]>(`/konten?kostenstelle=${kostenstelleId}`).then(setKonten).catch(() => setKonten([]));
  }, [kostenstelleId]);

  useEffect(() => {
    api.get<Steuersatz[]>("/steuersaetze").then(setSteuersaetze).catch(() => {});
  }, []);

  // Voraussichtliche Belegnummer (verbindlich vergibt sie der Server beim Speichern).
  useEffect(() => {
    if (!kostenstelleId || bearbeiten) return;
    api
      .get<{ belegnummer: string }>(`/buchungen/naechste-belegnummer?kostenstelle=${kostenstelleId}&jahr=${jahr}&monat=${monat}`)
      .then((r) => setVorschauNr(r.belegnummer))
      .catch(() => setVorschauNr(""));
  }, [kostenstelleId, jahr, monat, bearbeiten, vorschauNeu]);

  useEffect(() => {
    if (!fokusNachRender.current) return;
    wurzel.current?.querySelector<HTMLElement>(`[data-feld="${fokusNachRender.current}"]`)?.focus();
    fokusNachRender.current = null;
  });

  const kontoVon = (id: number) => konten.find((k) => k.id === id);

  // --- abgeleitete Werte ---
  const tagZahl = /^\d{1,2}$/.test(tag.trim()) ? Number(tag) : NaN;
  const tagOk = tagZahl >= 1 && tagZahl <= tageImMonat;
  const belegdatum = `${jahr}-${zweistellig(monat)}-${zweistellig(tagOk ? tagZahl : 1)}`;
  const posCent = positionen.map((p) => betragCent(p.betrag));
  const summeCent = posCent.reduce<number>((s, c) => s + (c ?? 0), 0);
  const gesamtCent = split ? betragCent(gesamt) : posCent[0];
  const restCent = split && gesamtCent != null ? gesamtCent - summeCent : 0;

  const fehlend: string[] = [];
  if (!tagOk) fehlend.push(tag.trim() ? `Tag (1–${tageImMonat})` : "Tag");
  if (split && gesamtCent == null) fehlend.push("Gesamtbetrag");
  positionen.forEach((p, i) => {
    const vor = split ? `Position ${i + 1}: ` : "";
    if (!p.kontoId) fehlend.push(`${vor}Konto`);
    if (posCent[i] == null) fehlend.push(`${vor}Betrag`);
    if (p.steuersatz == null) fehlend.push(`${vor}Steuersatz`);
  });
  if (split && gesamtCent != null && restCent !== 0) {
    fehlend.push(restCent > 0 ? `noch ${formatCent(restCent)} aufzuteilen` : `${formatCent(-restCent)} zu viel aufgeteilt`);
  }
  if (!beschreibung.trim()) fehlend.push("Beschreibung");
  const vollstaendig = fehlend.length === 0;

  // --- Änderungen ---
  function positionAendern(i: number, aenderung: Partial<Position>) {
    setPositionen((alt) => alt.map((p, idx) => (idx === i ? { ...p, ...aenderung } : p)));
  }

  // Konto gewählt: fixer Steuersatz wird übernommen, sonst muss er neu gewählt werden.
  function kontoWaehlen(i: number, kontoId: number) {
    positionAendern(i, { kontoId, steuersatz: kontoVon(kontoId)?.fixSteuersatz ?? null });
  }

  // Neue Split-Position mit dem offenen Restbetrag als Vorschlag.
  function positionHinzufuegen() {
    const rest = restCent > 0 ? centZuEingabe(restCent) : "";
    setPositionen((alt) => [...alt, { ...LEER, betrag: rest }]);
    fokusNachRender.current = `pos-konto-${positionen.length}`;
  }
  function positionEntfernen(i: number) {
    setPositionen((alt) => alt.filter((_, idx) => idx !== i));
  }

  function splitUmschalten(an: boolean) {
    setSplit(an);
    if (an) {
      // Bisherigen Betrag als Gesamtbetrag und erste Position übernehmen.
      setGesamt(positionen[0].betrag);
    } else {
      setPositionen((alt) => [alt[0] ?? { ...LEER }]);
      setGesamt("");
    }
  }

  // Enter springt zum nächsten Feld; nach dem letzten Feld wird gespeichert.
  // Bei der Splitbuchung legt Enter im Steuersatz der letzten Position bei
  // offenem Restbetrag eine neue Position an.
  function beiTaste(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    const ziel = e.target as HTMLElement;
    const feld = ziel.dataset?.feld;
    if (!feld) return;
    e.preventDefault();

    const letztePos = positionen.length - 1;
    if (split && feld === `pos-steuer-${letztePos}`) {
      if (restCent > 0) return positionHinzufuegen();
      if (restCent === 0 && vollstaendig) return void speichern();
    }
    if (feld === "beschreibung") return void speichern();

    const felder = Array.from(wurzel.current?.querySelectorAll<HTMLElement>("[data-feld]") ?? []).filter(
      (el) => !(el as HTMLInputElement).disabled
    );
    const naechstes = felder[felder.indexOf(ziel) + 1];
    if (naechstes) {
      naechstes.focus();
      if (naechstes instanceof HTMLInputElement) naechstes.select();
    } else {
      void speichern();
    }
  }

  async function speichern() {
    setFehler("");
    setVersucht(true);
    if (!vollstaendig) {
      setFehler(`Bitte ausfüllen: ${fehlend.join(", ")}.`);
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
        beschreibung: beschreibung.trim(),
        betragCent: summeCent,
        belegId,
        positionen: positionen.map((p, i) => ({
          betragCent: posCent[i],
          steuersatz: p.steuersatz,
          kontoId: p.kontoId,
        })),
      };

      if (istBearbeiten && bearbeiten) {
        // Bearbeiten: Buchung wird direkt geändert (Belegnummer bleibt).
        // Ohne neue Datei bleibt der bisherige Beleg erhalten (belegId undefined).
        const neu = await api.put<{ belegnummer: string }>(`/buchungen/${bearbeiten.buchungId}`, nutzdaten);
        setErfolg(`Buchung Nr. ${bearbeiten.buchungsnummer} gespeichert (Belegnummer ${neu.belegnummer}).`);
      } else {
        const buchung = await api.post<{ belegnummer: string }>("/buchungen", nutzdaten);
        setErfolg(`Buchung gespeichert. Belegnummer ${buchung.belegnummer} – bitte auf den Papierbeleg schreiben.`);
      }

      // Zurücksetzen; Tag (= Datum des vorherigen Belegs) und Typ bleiben stehen.
      setSplit(false);
      setGesamt("");
      setPositionen([{ ...LEER }]);
      setBeschreibung("");
      setDatei(null);
      setBelegReset((n) => n + 1);
      setFehler("");
      setVersucht(false);
      setVorschauNeu((n) => n + 1);
      onGespeichert();
      if (istBearbeiten && onBearbeitenAbbrechen) onBearbeitenAbbrechen(); // Bearbeiten-Modus verlassen
      fokusNachRender.current = "tag";
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setSpeichert(false);
    }
  }

  // Steuersatz-Auswahl; ein inzwischen inaktiver Satz (Bearbeiten) bleibt sichtbar.
  function steuerOptionen(aktuell: number | null) {
    const liste = [...steuersaetze];
    if (aktuell != null && !liste.some((s) => s.prozent === aktuell)) {
      liste.push({ id: -1, prozent: aktuell, bezeichnung: "" });
    }
    return liste.map((s) => (
      <option key={s.id} value={String(s.prozent)}>{formatProzent(s.prozent)} %</option>
    ));
  }

  function positionsFelder(p: Position, i: number) {
    const fix = kontoVon(p.kontoId)?.fixSteuersatz;
    return (
      <>
        <div className={split ? "col-span-5" : "col-span-6"}>
          {(!split || i === 0) && <label className="block text-sm font-medium mb-1">Konto *</label>}
          <select
            data-feld={`pos-konto-${i}`}
            className={feldKlasse(versucht && !p.kontoId)}
            value={p.kontoId}
            onChange={(e) => kontoWaehlen(i, Number(e.target.value))}
          >
            <option value={0}>Konto wählen…</option>
            {konten.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nummer} – {k.bezeichnung}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-3">
          {(!split || i === 0) && <label className="block text-sm font-medium mb-1">Betrag (brutto) *</label>}
          <input
            data-feld={`pos-betrag-${i}`}
            inputMode="decimal"
            className={`${feldKlasse(versucht && posCent[i] == null)} text-right`}
            placeholder="0,00"
            value={p.betrag}
            onChange={(e) => positionAendern(i, { betrag: e.target.value })}
          />
        </div>
        <div className="col-span-3">
          {(!split || i === 0) && <label className="block text-sm font-medium mb-1">Steuersatz *</label>}
          <select
            data-feld={`pos-steuer-${i}`}
            className={feldKlasse(versucht && p.steuersatz == null)}
            value={p.steuersatz == null ? "" : String(p.steuersatz)}
            disabled={fix != null}
            title={fix != null ? "Fixer Steuersatz dieses Kontos" : undefined}
            onChange={(e) => positionAendern(i, { steuersatz: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">wählen…</option>
            {steuerOptionen(p.steuersatz)}
          </select>
        </div>
      </>
    );
  }

  const anzeigeNr = istBearbeiten ? bearbeiten!.belegnummer : vorschauNr;

  return (
    <div ref={wurzel} onKeyDown={beiTaste} className="bg-white rounded-lg shadow-sm p-5">
      <h2 className="font-semibold text-marke-900 mb-4">
        {istBearbeiten ? `Buchung bearbeiten (Nr. ${bearbeiten!.buchungsnummer})` : "Neue Buchung"}
      </h2>

      {istBearbeiten && (
        <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
          Änderungen werden direkt an dieser Buchung gespeichert; Buchungs- und Belegnummer bleiben erhalten.
          {bearbeiten!.hatBeleg && " Der vorhandene Beleg bleibt, solange kein neuer gewählt wird."}
        </div>
      )}

      {fehler && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">{fehler}</div>
      )}

      {erfolg && (
        <div className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded-sm px-3 py-2">
          {erfolg}
        </div>
      )}

      {/* 1–4: Datum, Belegnummer, Typ, Splitbuchung */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        <div className="col-span-3">
          <label className="block text-sm font-medium mb-1">Tag *</label>
          <div className="flex items-center gap-2">
            <input
              data-feld="tag"
              inputMode="numeric"
              maxLength={2}
              className={`${feldKlasse(versucht && !tagOk)} w-16 text-right ${tag.trim() && !tagOk ? "border-red-500" : ""}`}
              value={tag}
              onChange={(e) => setTag(e.target.value.replace(/\D/g, ""))}
            />
            <span className="text-slate-600">.{zweistellig(monat)}.{jahr}</span>
          </div>
          {tag.trim() && !tagOk && (
            <div className="text-xs text-red-700 mt-1">Der {zweistellig(monat)}/{jahr} hat nur {tageImMonat} Tage.</div>
          )}
        </div>
        <div className="col-span-3">
          <label className="block text-sm font-medium mb-1">Belegnummer</label>
          <div
            className="border rounded-sm px-3 py-2 bg-slate-50 text-slate-700"
            title={istBearbeiten ? undefined : "Wird beim Speichern automatisch und fortlaufend vergeben; frei gewordene Nummern dieses Monats zuerst."}
          >
            {anzeigeNr ? anzeigeNr.replace(/^\d{4}-/, "") : "–"}
            {!istBearbeiten && anzeigeNr && <span className="text-xs text-slate-500"> (voraussichtlich)</span>}
          </div>
        </div>
        <div className="col-span-3">
          <label className="block text-sm font-medium mb-1">Typ *</label>
          <select
            data-feld="typ"
            className={feldKlasse(false)}
            value={typ}
            onChange={(e) => setTyp(e.target.value as "eingang" | "ausgang")}
          >
            <option value="ausgang">Ausgang</option>
            <option value="eingang">Eingang</option>
          </select>
        </div>
        <div className="col-span-3">
          <label className="block text-sm font-medium mb-1">Splitbuchung</label>
          <select
            data-feld="split"
            className={feldKlasse(false)}
            value={split ? "ja" : "nein"}
            onChange={(e) => splitUmschalten(e.target.value === "ja")}
          >
            <option value="nein">nein</option>
            <option value="ja">ja</option>
          </select>
        </div>
      </div>

      {/* 5–7: Konto, Betrag, Steuersatz – bzw. Gesamtbetrag + Positionen */}
      {!split ? (
        <div className="grid grid-cols-12 gap-4 mb-4">{positionsFelder(positionen[0], 0)}</div>
      ) : (
        <div className="mb-4 border rounded-sm p-3 bg-slate-50/50">
          <div className="grid grid-cols-12 gap-4 mb-3 items-end">
            <div className="col-span-4">
              <label className="block text-sm font-medium mb-1">Gesamtbetrag laut Beleg (brutto) *</label>
              <input
                data-feld="gesamt"
                inputMode="decimal"
                className={`${feldKlasse(versucht && gesamtCent == null)} text-right`}
                placeholder="0,00"
                value={gesamt}
                onChange={(e) => setGesamt(e.target.value)}
              />
            </div>
            <div className="col-span-8 text-right text-sm">
              {gesamtCent != null && (
                <span className={restCent === 0 ? "text-green-700 font-medium" : "text-amber-800 font-medium"}>
                  {restCent === 0
                    ? "Vollständig aufgeteilt"
                    : restCent > 0
                    ? `Noch aufzuteilen: ${formatCent(restCent)}`
                    : `Zu viel aufgeteilt: ${formatCent(-restCent)}`}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {positionen.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                {positionsFelder(p, i)}
                <button
                  type="button"
                  onClick={() => positionEntfernen(i)}
                  disabled={positionen.length === 1}
                  className="col-span-1 text-red-600 disabled:text-slate-300 pb-2"
                  title="Position entfernen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={positionHinzufuegen} className="mt-2 text-sm text-marke-700 hover:underline">
            + Position
          </button>
        </div>
      )}

      {/* 8: Beschreibung */}
      <label className="block text-sm font-medium mb-1">Beschreibung *</label>
      <input
        data-feld="beschreibung"
        className={`${feldKlasse(versucht && !beschreibung.trim())} mb-4`}
        value={beschreibung}
        onChange={(e) => setBeschreibung(e.target.value)}
      />

      {/* 9: Foto / Beleg (optional) */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1">
          <BelegErfassung key={belegReset} onDatei={setDatei} />
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">Summe</div>
          <div className="text-lg font-semibold">{formatCent(summeCent)}</div>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={() => void speichern()}
          disabled={speichert || !vollstaendig}
          title={vollstaendig ? undefined : `Noch offen: ${fehlend.join(", ")}`}
          className="flex-1 bg-marke-700 text-white rounded-sm py-2 font-medium hover:bg-marke-800 disabled:opacity-50"
        >
          {speichert ? "Speichert…" : istBearbeiten ? "Änderungen speichern" : "Buchung speichern"}
        </button>
        {istBearbeiten && onBearbeitenAbbrechen && (
          <button
            type="button"
            onClick={onBearbeitenAbbrechen}
            disabled={speichert}
            className="border rounded-sm px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Abbrechen
          </button>
        )}
      </div>
      {!vollstaendig && (
        <p className="text-xs text-slate-500 mt-2">
          * Pflichtfeld. Noch offen: {fehlend.join(", ")}. Enter springt zum nächsten Feld.
        </p>
      )}
    </div>
  );
}
