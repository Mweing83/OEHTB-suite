// Frontend-Pendant zur Geld-Behandlung. Beträge kommen als Cent (Ganzzahl).

export function formatCent(cent: number): string {
  return (cent / 100).toLocaleString("de-AT", {
    style: "currency",
    currency: "EUR",
  });
}

// Eingabe "12,50" oder "12.50" -> 1250 Cent
export function euroStringZuCent(eingabe: string): number {
  const norm = eingabe.replace(/\./g, "").replace(",", ".").trim();
  const zahl = parseFloat(norm);
  if (isNaN(zahl)) return NaN;
  return Math.round(zahl * 100);
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
