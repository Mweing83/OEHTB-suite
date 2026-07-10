// Geldbeträge werden überall als Ganzzahl in Cent geführt.
// Diese Helfer kapseln Umrechnung und Formatierung.

export function euroZuCent(euro: number): number {
  return Math.round(euro * 100);
}

export function centZuEuro(cent: number): number {
  return cent / 100;
}

// Anzeige z. B. "12,50 €"
export function formatCent(cent: number): string {
  return (cent / 100).toLocaleString("de-AT", {
    style: "currency",
    currency: "EUR",
  });
}
