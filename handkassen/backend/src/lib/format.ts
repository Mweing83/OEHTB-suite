// Text-Formate für Exporte und Berichte – je Format genau eine Funktion.

// Cent -> "1234,56" (Komma als Dezimaltrenner, kein Tausenderpunkt)
export function centZuStr(cent: number): string {
  return (cent / 100).toFixed(2).replace(".", ",");
}

// Datum -> "01.05.2026"
export function datumDe(d: Date): string {
  const t = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${t}.${m}.${d.getFullYear()}`;
}
