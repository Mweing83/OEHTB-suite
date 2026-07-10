// =====================================================================
//  BMD-Export: Zuordnungstabellen
//  Diese Werte stammen NICHT aus der App, sondern aus der BMD-Buchhaltung.
//  Sie müssen mit der Buchhaltung abgestimmt und hier eingetragen werden.
//
//  Solange ein Wert fehlt, schreibt der Export an dieser Stelle einen
//  klar erkennbaren Platzhalter (z. B. "FEHLT"), damit keine
//  unvollständige Datei versehentlich in BMD importiert wird.
// =====================================================================

// 1) (NICHT MEHR VERWENDET) Früher: Kostenstelle (App-ID) -> BMD-Kostenstellennummer.
//    Die "kost" wird jetzt direkt aus der Kostenstellen-Nummer (Feld "nummer",
//    z. B. "1370") gebildet, die in der Verwaltung gepflegt wird. Diese Tabelle
//    bleibt nur als Referenz erhalten und wird vom Export nicht mehr gelesen.
export const KOSTENSTELLE_ZU_BMD_KOST: Record<number, string> = {
  // Beispiel: 1: "1260",
  // Beispiel: 2: "1140",
};

// 2) (NICHT MEHR VERWENDET) Früher: BMD-Kostenstellennummer -> Gegenkonto.
//    Das Gegenkonto wird jetzt je Kostenstelle in der Verwaltung gepflegt
//    (Feld "Gegenkonto") und von dort in den Export übernommen. Diese Tabelle
//    bleibt nur als Referenz erhalten und wird vom Export nicht mehr gelesen.
export const BMD_KOST_ZU_GKONTO: Record<string, { ausgabe: string; einlage: string }> = {
  // Beispiel: "1260": { ausgabe: "99957", einlage: "99955" },
};

// 3) Steuercode-Zuordnung: Konten in dieser Liste bekommen "00", alle anderen "02".
//    Beobachtung aus der Musterdatei (bitte mit Buchhaltung bestätigen).
export const KONTEN_MIT_STEUERCODE_00: Set<string> = new Set([
  "22991",
  "268016",
  "28970",
  "97000",
  "99900",
]);

// 4) Fixwerte (aus der Musterdatei abgeleitet, in der Regel unverändert)
export const BMD_FIX = {
  satzart: "0",
  buchsymbol: "KA", // Kassa
};
