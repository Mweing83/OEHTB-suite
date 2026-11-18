// Gemeinsame Prüfung von IDs, Jahr und Monat aus Anfragen – an EINER Stelle,
// damit überall dieselben Grenzen gelten (vorher fünf leicht verschiedene
// Varianten, teils ohne Obergrenze oder nur "truthy").

// Positive Ganzzahl (Datenbank-ID).
export function istId(wert: unknown): wert is number {
  return typeof wert === "number" && Number.isInteger(wert) && wert > 0;
}

export function istJahr(wert: unknown): wert is number {
  return typeof wert === "number" && Number.isInteger(wert) && wert >= 2000 && wert <= 2100;
}

export function istMonat(wert: unknown): wert is number {
  return typeof wert === "number" && Number.isInteger(wert) && wert >= 1 && wert <= 12;
}

// ID aus einem Query-Parameter ("12" -> 12), sonst null.
export function idAusQuery(wert: unknown): number | null {
  const id = Number(wert);
  return typeof wert === "string" && wert !== "" && istId(id) ? id : null;
}

// ?jahr=2026&monat=5 -> { jahr, monat }, sonst null.
export function jahrMonatAusQuery(q: Record<string, unknown>): { jahr: number; monat: number } | null {
  const jahr = Number(q.jahr);
  const monat = Number(q.monat);
  return istJahr(jahr) && istMonat(monat) ? { jahr, monat } : null;
}
