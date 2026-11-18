// Reine Rechenlogik des Buchungsformulars (ohne React) – per Unit-Test prüfbar.
import { centZuEingabe, euroStringZuCent, formatCent } from "./geld.js";

export type Typ = "eingang" | "ausgang";

export interface Position {
  // Typ der Zeile bei Splitbuchung (z. B. Pfand retour = Einnahme in einer
  // Ausgabe-Rechnung); null = wie die Buchung.
  typ: Typ | null;
  // Vom Formular vorgeschlagene Restbetrags-Zeile (beim Bearbeiten), solange
  // sie niemand angefasst hat: sie folgt dem Rest und verschwindet bei Rest 0.
  auto?: boolean;
  text: string; // Beschreibung der Buchungszeile (nur bei Splitbuchung)
  betrag: string; // Eingabe als Text ("12,50")
  steuersatz: number | null; // null = noch nicht gewählt (kein Vorschlag)
  kontoId: number;
}

export const LEER: Position = { typ: null, text: "", betrag: "", steuersatz: null, kontoId: 0 };

// Betragseingabe einer Zeile: gültig nur als positiver Betrag, sonst null.
export function betragCent(text: string): number | null {
  const c = euroStringZuCent(text);
  return isNaN(c) || c <= 0 ? null : c;
}

const gegenTyp = (typ: Typ): Typ => (typ === "ausgang" ? "eingang" : "ausgang");

// Vorzeichenbehaftete Summe: Zeilen vom Typ der Buchung zählen plus, Zeilen
// des anderen Typs minus (Hofer: 10 + 20 − 5 Pfand = 25 bezahlt).
export function positionsSumme(positionen: Position[], typ: Typ): number {
  return positionen.reduce((s, p) => s + ((p.typ ?? typ) === typ ? 1 : -1) * (betragCent(p.betrag) ?? 0), 0);
}

// Gesamtbetrag und offener Rest. Bei der Splitbuchung zählt der eingegebene
// Gesamtbetrag laut Beleg; ohne Split ist es der Betrag der einzigen Zeile
// (Rest 0). Rest > 0 = noch aufzuteilen, < 0 = zu viel aufgeteilt.
export function gesamtUndRest(
  split: boolean,
  gesamt: string,
  positionen: Position[],
  typ: Typ
): { gesamtCent: number | null; restCent: number } {
  const gesamtCent = betragCent(split ? gesamt : (positionen[0]?.betrag ?? ""));
  const restCent = split && gesamtCent != null ? gesamtCent - positionsSumme(positionen, typ) : 0;
  return { gesamtCent, restCent };
}

// Eingabe im Tag-Feld als Tag des Monats; null, wenn leer oder ungültig.
export function tagAusEingabe(tag: string, tageImMonat: number): number | null {
  const zahl = /^\d{1,2}$/.test(tag.trim()) ? Number(tag) : NaN;
  return zahl >= 1 && zahl <= tageImMonat ? zahl : null;
}

// Stand der Eingaben im Buchungsformular (für die Pflichtfeld-Prüfung).
export interface FormularStand {
  tag: string;
  tageImMonat: number;
  typ: Typ;
  split: boolean;
  gesamt: string; // Gesamtbetrag laut Beleg (nur Splitbuchung)
  positionen: Position[];
  beschreibung: string; // Beschreibung der Buchung (nur ohne Split)
}

// Pflichtfeld-Prüfung: Liste der noch offenen Angaben in Formular-Reihenfolge
// (leer = vollständig, Speichern möglich).
export function fehlendeFelder(s: FormularStand): string[] {
  const fehlend: string[] = [];
  if (tagAusEingabe(s.tag, s.tageImMonat) == null) {
    fehlend.push(s.tag.trim() ? `Tag (1–${s.tageImMonat})` : "Tag");
  }
  const { gesamtCent, restCent } = gesamtUndRest(s.split, s.gesamt, s.positionen, s.typ);
  if (s.split && gesamtCent == null) fehlend.push("Gesamtbetrag");
  s.positionen.forEach((p, i) => {
    const vor = s.split ? `Position ${i + 1}: ` : "";
    if (!p.kontoId) fehlend.push(`${vor}Konto`);
    if (betragCent(p.betrag) == null) fehlend.push(`${vor}Betrag`);
    if (p.steuersatz == null) fehlend.push(`${vor}Steuersatz`);
    if (s.split && !p.text.trim()) fehlend.push(`${vor}Beschreibung`);
  });
  if (restCent !== 0) {
    fehlend.push(restCent > 0 ? `noch ${formatCent(restCent)} aufzuteilen` : `${formatCent(-restCent)} zu viel aufgeteilt`);
  }
  // Ohne Split eine Beschreibung für die Buchung, mit Split je Zeile (oben).
  if (!s.split && !s.beschreibung.trim()) fehlend.push("Beschreibung");
  return fehlend;
}

// Bearbeiten einer Splitbuchung: entsteht durch eine Änderung ein Restbetrag,
// wird eine weitere Zeile mit diesem Rest vorgeschlagen (bei zu viel
// aufgeteiltem Betrag als Zeile des anderen Typs). Eine bereits vorgeschlagene,
// unberührte Zeile wird angepasst bzw. bei Rest 0 entfernt. Vorgeschlagen wird
// nur, wenn die übrigen Zeilen vollständig sind (sonst tippt gerade jemand).
// Gibt dasselbe Array zurück, wenn nichts zu tun ist.
export function restzeileAnpassen(positionen: Position[], gesamtCent: number | null, typ: Typ): Position[] {
  if (gesamtCent == null) return positionen;
  const eigene = positionen.filter((p) => !p.auto);
  const auto = positionen.find((p) => p.auto);
  const rest = gesamtCent - positionsSumme(eigene, typ);
  if (rest === 0) return auto ? eigene : positionen;

  const vorschlag: Position = {
    ...(auto ?? LEER),
    auto: true,
    betrag: centZuEingabe(Math.abs(rest)),
    typ: rest > 0 ? typ : gegenTyp(typ),
  };
  if (auto) {
    if (auto.betrag === vorschlag.betrag && auto.typ === vorschlag.typ) return positionen;
    return positionen.map((p) => (p.auto ? vorschlag : p));
  }
  const vollstaendig = eigene.every((p) => p.kontoId && betragCent(p.betrag) != null && p.steuersatz != null);
  return vollstaendig ? [...eigene, vorschlag] : positionen;
}
