// Reine Rechenlogik des Buchungsformulars (ohne React) – per Unit-Test prüfbar.
import { euroStringZuCent } from "./geld.js";

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

export function centZuEingabe(cent: number): string {
  return (cent / 100).toFixed(2).replace(".", ",");
}

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
