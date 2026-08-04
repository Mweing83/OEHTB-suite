// Zentrale, testbare Geschäftslogik für Buchungen.
// Reine Funktionen ohne Datenbankzugriff -> leicht per Unit-Test prüfbar.

// Fallback-Sätze, falls keine aktiven Steuersätze übergeben werden.
// Die tatsächlich erlaubten Sätze kommen zur Laufzeit aus der Datenbank
// (Tabelle "steuersatz") und werden an buchungValidieren übergeben.
export const STANDARD_STEUERSAETZE = [0, 10, 20] as const;

export interface PositionEingabe {
  betragCent: number;
  steuersatz: number;
  kontoId: number;
}

export interface BuchungEingabe {
  betragCent: number;
  belegdatum: string;
  typ: "eingang" | "ausgang";
  kostenstelleId: number;
  beschreibung?: string;
  positionen: PositionEingabe[];
}

export interface ValidierungsErgebnis {
  ok: boolean;
  fehler: string[];
}

// Prüft eine Buchung gegen die Domänenregeln aus dem Lastenheft / der CLAUDE.md.
// erlaubteSteuersaetze: Liste der aktuell gültigen Sätze (aus der Datenbank).
export function buchungValidieren(
  b: BuchungEingabe,
  erlaubteSteuersaetze: number[] = [...STANDARD_STEUERSAETZE]
): ValidierungsErgebnis {
  const fehler: string[] = [];

  if (!Number.isInteger(b.betragCent) || b.betragCent <= 0) {
    fehler.push("Betrag muss eine positive Ganzzahl in Cent sein.");
  }

  if (!b.positionen || b.positionen.length === 0) {
    fehler.push("Mindestens eine Buchungsposition ist erforderlich.");
  }

  for (const [i, pos] of (b.positionen ?? []).entries()) {
    if (!Number.isInteger(pos.betragCent)) {
      fehler.push(`Position ${i + 1}: Betrag muss Ganzzahl in Cent sein.`);
    }
    if (!erlaubteSteuersaetze.includes(pos.steuersatz)) {
      fehler.push(
        `Position ${i + 1}: Steuersatz ${pos.steuersatz} ist nicht erlaubt (erlaubt: ${erlaubteSteuersaetze.join(", ")}).`
      );
    }
    if (!Number.isInteger(pos.kontoId)) {
      fehler.push(`Position ${i + 1}: gültiges Konto erforderlich.`);
    }
  }

  // Split-Regel: Summe der Positionen = Buchungsbetrag (cent-genau).
  const summe = (b.positionen ?? []).reduce((s, p) => s + p.betragCent, 0);
  if (b.positionen && b.positionen.length > 0 && summe !== b.betragCent) {
    fehler.push(
      `Summe der Positionen (${summe} Cent) entspricht nicht dem Buchungsbetrag (${b.betragCent} Cent).`
    );
  }

  if (!b.belegdatum || isNaN(Date.parse(b.belegdatum))) {
    fehler.push("Gültiges Belegdatum erforderlich.");
  }

  if (b.typ !== "eingang" && b.typ !== "ausgang") {
    fehler.push("Buchungstyp muss 'eingang' oder 'ausgang' sein.");
  }

  return { ok: fehler.length === 0, fehler };
}

// Saldo-Wirkung einer Buchung auf die Kostenstelle (in Cent).
export function saldoWirkung(typ: "eingang" | "ausgang", betragCent: number): number {
  return typ === "eingang" ? betragCent : -betragCent;
}

// Setzt die Belegnummer aus Jahr, Kostenstellen-Nummer und laufender Nummer
// zusammen. Die laufende Nummer wird mindestens zweistellig dargestellt.
// Beispiel: belegnummerFormat(2026, "1370", 1) -> "2026-1370-01".
export function belegnummerFormat(jahr: number, kostenstelleNummer: string, laufnummer: number): string {
  return `${jahr}-${kostenstelleNummer}-${String(laufnummer).padStart(2, "0")}`;
}

// Wandelt die dezimalen Steuersaetze einer Buchung (Prisma-Decimal) in JS-Zahlen,
// damit das Frontend wie gewohnt mit number arbeitet. Number(Decimal) nutzt valueOf.
export function buchungFuerAusgabe<T extends { positionen: Array<{ steuersatz: unknown }> }>(b: T): T {
  return {
    ...b,
    positionen: b.positionen.map((p) => ({ ...p, steuersatz: Number(p.steuersatz) })),
  };
}
