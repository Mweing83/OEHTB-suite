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
  text?: string | null; // Pflicht bei Splitbuchung (mehrere Positionen)
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
    // Positionen muessen positiv sein: sonst liessen sich z. B. +20.000 EUR auf
    // einem Konto und -19.990 EUR auf einem anderen "verstecken", solange die
    // Summe stimmt (Security-Audit 2026-10, Haertung).
    if (!Number.isInteger(pos.betragCent) || pos.betragCent <= 0) {
      fehler.push(`Position ${i + 1}: Betrag muss eine positive Ganzzahl in Cent sein.`);
    }
    if (!erlaubteSteuersaetze.includes(pos.steuersatz)) {
      fehler.push(
        `Position ${i + 1}: Steuersatz ${pos.steuersatz} ist nicht erlaubt (erlaubt: ${erlaubteSteuersaetze.join(", ")}).`
      );
    }
    if (!Number.isInteger(pos.kontoId)) {
      fehler.push(`Position ${i + 1}: gültiges Konto erforderlich.`);
    }
    // Splitbuchung: jede Buchungszeile braucht einen eigenen Text, weil sie
    // als eigene Zeile exportiert wird (Key-User-Feedback 2026-11).
    if ((b.positionen ?? []).length > 1 && (typeof pos.text !== "string" || pos.text.trim() === "")) {
      fehler.push(`Position ${i + 1}: Beschreibung ist erforderlich.`);
    }
  }

  // Split-Regel: Summe der Positionen = Buchungsbetrag (cent-genau).
  const summe = (b.positionen ?? []).reduce((s, p) => s + p.betragCent, 0);
  if (b.positionen && b.positionen.length > 0 && summe !== b.betragCent) {
    fehler.push(
      `Summe der Positionen (${summe} Cent) entspricht nicht dem Buchungsbetrag (${b.betragCent} Cent).`
    );
  }

  if (!datumGueltig(b.belegdatum)) {
    fehler.push("Gültiges Belegdatum erforderlich.");
  }

  // Beschreibung ist Pflicht (Key-User-Feedback 2026-11).
  if (typeof b.beschreibung !== "string" || b.beschreibung.trim() === "") {
    fehler.push("Beschreibung ist erforderlich.");
  }

  if (b.typ !== "eingang" && b.typ !== "ausgang") {
    fehler.push("Buchungstyp muss 'eingang' oder 'ausgang' sein.");
  }

  return { ok: fehler.length === 0, fehler };
}

// Belegdatum "JJJJ-MM-TT" (optional mit Uhrzeit) mit echtem Kalendertag:
// lehnt z. B. den 31.09. ab, den Date.parse still auf den 01.10. schieben würde.
export function datumGueltig(wert: unknown): boolean {
  if (typeof wert !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(wert);
  if (!m || isNaN(Date.parse(wert))) return false;
  const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(j, mo - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t;
}

// Splitbuchung: Positionstexte bereinigen und – falls keine eigene Beschreibung
// mitkommt – die Buchungsbeschreibung aus den Zeilentexten bilden (für Liste
// und Berichte). Ohne Split bleibt der Positionstext leer (null).
export function textNormalisieren<T extends BuchungEingabe>(b: T): T {
  const positionen = b.positionen ?? [];
  if (positionen.length <= 1) {
    return { ...b, positionen: positionen.map((p) => ({ ...p, text: null })) };
  }
  const mitText = positionen.map((p) => ({ ...p, text: typeof p.text === "string" ? p.text.trim() : p.text }));
  const beschreibung =
    typeof b.beschreibung === "string" && b.beschreibung.trim()
      ? b.beschreibung
      : mitText.map((p) => p.text).filter(Boolean).join(" / ");
  return { ...b, beschreibung, positionen: mitText };
}

// Text einer Buchungszeile für Exporte: eigener Text, sonst Buchungsbeschreibung.
export function positionsText(p: { text?: string | null }, beschreibung: string | null | undefined): string {
  return (p.text && p.text.trim()) || beschreibung || "";
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
