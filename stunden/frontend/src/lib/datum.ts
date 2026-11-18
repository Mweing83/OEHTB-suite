// Datum "JJJJ-MM-TT" -> "TT/MM/JJJJ" (europaeisches Layout) fuer die Anzeige.
// Alles andere wird unveraendert zurueckgegeben.
export function datumDe(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [j, m, t] = iso.split("-");
  return `${t}/${m}/${j}`;
}
