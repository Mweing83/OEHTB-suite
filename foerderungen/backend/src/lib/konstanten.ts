// Schluessel der Einstellung-Tabelle + Standardwerte.
export const LLM_SCHLUESSEL = "llm_konfig";
export const SCAN_SCHLUESSEL = "scan_konfig";
// Getrennte Zeitplaene (Kostenersparnis: Entdeckung braucht nicht woechentlich
// zu laufen, neue Foerderquellen entstehen selten).
// - ueberwachung: woechentlich; wochentag 0 = Sonntag … 6 = Samstag.
// - entdeckung: monatlich; tag = Tag des Monats (1-28).
export const SCAN_STANDARD = {
  ueberwachung: { aktiv: false, wochentag: 1, stunde: 6 },
  entdeckung: { aktiv: false, tag: 1, stunde: 7 },
};
