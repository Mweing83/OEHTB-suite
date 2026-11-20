// Farbliche Kennzeichnung des Buchungstyps, überall gleich: Ausgang/Ausgabe
// dezent rot, Eingang/Einnahme dezent grün (Formular, Splitzeilen, Liste).
// So fällt ein versehentlich falsch gewählter Typ sofort auf.
export const typFarbe = (typ: "eingang" | "ausgang"): string =>
  typ === "eingang" ? "bg-green-50 border-green-300 text-green-900" : "bg-red-50 border-red-300 text-red-900";

// Für die <option>-Einträge einer eingefärbten Auswahl: die aufgeklappte
// Liste soll neutral bleiben (sonst erbt sie die Farbe der Auswahl).
export const OPTION_NEUTRAL = "bg-white text-slate-900";
