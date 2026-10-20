// CSV-Feld escapen (Semikolon-getrennt, Excel de-AT): bei Sonderzeichen in
// Anführungszeichen. Zellen, die eine Tabellenkalkulation als Formel auswerten
// würde (= + - @ am Anfang, auch nach Tab/CR/Leerzeichen), werden mit Apostroph
// entschärft und immer gequotet (Security-Audit 2026-10: CSV-Formel-Injektion).
// Reine Beträge wie "-10,00" bleiben unverändert numerisch.
const BETRAG = /^-?\d+(?:,\d+)?$/;

export function csvFeld(wert: string | number): string {
  const s0 = String(wert ?? "").replace(/[\t\r\n]+/g, " ");
  const t = s0.trimStart();
  const formel = /^[=+\-@]/.test(t) && !BETRAG.test(t);
  const s = formel ? "'" + t : s0;
  if (formel || s.includes(";") || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
