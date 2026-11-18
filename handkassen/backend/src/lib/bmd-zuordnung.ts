// =====================================================================
//  BMD-Export: feste Codes
//  Diese Werte stammen NICHT aus der App, sondern aus der BMD-Buchhaltung
//  und sind mit ihr abgestimmt. Kostenstellen-Nummer ("kost") und Gegenkonto
//  kommen aus der Verwaltung -> Kostenstellen; fehlt dort ein Gegenkonto,
//  verweigert der Export (routes/export.ts) die Datei.
// =====================================================================

// 1) Buchungs- und Steuercodes (mit der Buchhaltung abgestimmt). In der Kassa
//    gibt es nur Ausgaben (Soll, Vorsteuer) und Einnahmen inkl. Dotierung und
//    Gutschriften (Haben, Umsatzsteuer).
export const BMD_CODES = {
  ausgang: { buchcode: "1", steuercode: "2" }, // Soll, Vorsteuer
  eingang: { buchcode: "2", steuercode: "1" }, // Haben, Umsatzsteuer
} as const;

// 2) Fixwerte (aus der Musterdatei abgeleitet, in der Regel unverändert)
export const BMD_FIX = {
  satzart: "0",
  buchsymbol: "KA", // Kassa
};
