// Eingabepruefung fuer eine Beschaeftigung (Wochenstunden, Ausmass, gueltig ab)
// – eine Stelle fuer das manuelle Erfassen und das Bestaetigen einer Anfrage.
// Die Grenzen entsprechen denen des Servers (beschaeftigungsWerteSchema):
// Stunden > 0 und hoechstens 168, Ausmass > 0 und hoechstens 100 %.
// Explizite Pruefung VOR dem Senden verhindert NaN, das durch
// undefined-Pruefungen rutscht.

export type BeschaeftigungsWerte =
  | { fehler: string }
  | { fehler: null; wochenstunden: number; ausmassProzent: number };

export function beschaeftigungPruefen(wochenstunden: string, ausmass: string, gueltigAb: string): BeschaeftigungsWerte {
  const std = Number(wochenstunden.replace(",", "."));
  const aus = Number(ausmass.replace(",", "."));
  if (wochenstunden.trim() === "" || !Number.isFinite(std) || std <= 0 || std > 168) {
    return { fehler: "Bitte gültige Wochenstunden eingeben (höchstens 168)." };
  }
  if (ausmass.trim() === "" || !Number.isFinite(aus) || aus <= 0 || aus > 100) {
    return { fehler: "Bitte gültiges Ausmaß (1–100 %) eingeben." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gueltigAb)) {
    return { fehler: "Bitte ein gültiges Datum wählen." };
  }
  return { fehler: null, wochenstunden: std, ausmassProzent: aus };
}
