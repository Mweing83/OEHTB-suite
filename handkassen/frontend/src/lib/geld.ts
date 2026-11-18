// Frontend-Pendant zur Geld-Behandlung. Beträge kommen als Cent (Ganzzahl).

export function formatCent(cent: number): string {
  return (cent / 100).toLocaleString("de-AT", {
    style: "currency",
    currency: "EUR",
  });
}

// Cent -> Eingabetext "12,50" (Gegenstück zu euroStringZuCent).
export function centZuEingabe(cent: number): string {
  return (cent / 100).toFixed(2).replace(".", ",");
}

// Betragseingabe -> Cent. Streng: alles, was nicht eindeutig ein Betrag ist,
// ergibt NaN (kein Raten, kein stilles Abschneiden).
//   "12,50" -> 1250      "12" -> 1200        "1.250,00" -> 125000
//   "12.50" -> 1250      (Punkt vom Ziffernblock als Dezimaltrenner)
//   "1.250" -> 125000    (drei Stellen nach dem Punkt = Tausenderpunkt)
//   "12abc", "1,2,3", "12,345" -> NaN
// Gerechnet wird in Ganzzahlen (kein Float-Rundungsfehler).
export function euroStringZuCent(eingabe: string): number {
  const t = eingabe.trim().replace(/\s|€/g, "");
  // Deutsche Schreibweise: optionale Tausenderpunkte, Komma vor den Cent.
  let m = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(t);
  // Punkt als Dezimaltrenner: genau ein Punkt mit ein oder zwei Nachkommastellen.
  if (!m) m = /^(-?)(\d+)\.(\d{1,2})$/.exec(t);
  if (!m) return NaN;
  const euro = Number(m[2].replace(/\./g, ""));
  const cent = Number((m[3] ?? "").padEnd(2, "0"));
  const betrag = euro * 100 + cent;
  return m[1] ? -betrag : betrag;
}

// Aus einem Brutto-Betrag (in Cent) den enthaltenen MwSt-Anteil herausrechnen.
// Beispiel: 1200 Cent bei 20 % -> 200 Cent Steueranteil.
export function enthalteneSteuerCent(bruttoCent: number, steuersatz: number): number {
  if (!steuersatz) return 0;
  const netto = bruttoCent / (1 + steuersatz / 100);
  return Math.round(bruttoCent - netto);
}

// Summe der enthaltenen MwSt über mehrere Positionen (z. B. Split-Buchung).
export function summeSteuerCent(
  positionen: { betragCent: number; steuersatz: number }[]
): number {
  return positionen.reduce(
    (summe, p) => summe + enthalteneSteuerCent(p.betragCent, p.steuersatz),
    0
  );
}

// Formatiert einen Steuersatz fuer die Anzeige. Ganze Werte ohne
// Nachkommastelle, gebrochene mit de-AT-Komma und einer Nachkommastelle.
// 20 -> "20", 13 -> "13", 4.9 -> "4,9", 0 -> "0".
export function formatProzent(satz: number): string {
  return Number.isInteger(satz)
    ? String(satz)
    : satz.toLocaleString("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
