import { csvFeld } from "./csv.js";
import { BMD_CODES, BMD_FIX } from "./bmd-zuordnung.js";

// =====================================================================
//  BMD-Buchungssatz-Datei (CSV, Semikolon, Latin-1, CRLF).
//  Eine Zeile je Buchungsposition; Spaltenaufbau nach Vorgabe der
//  Buchhaltung. "dokument" ist der Dateiname des Belegs, wie er auch im
//  ZIP-Export liegt (Belegnummer + Endung, z. B. "2026-1370-01.jpg").
// =====================================================================

export const BMD_SPALTEN = [
  "satzart", "konto", "gkonto", "belegdatum", "belegnr", "kost", "prozent",
  "steuercode", "buchcode", "betrag", "steuer", "text", "buchsymbol", "dokument",
] as const;

export interface BmdPosition {
  betragCent: number;
  steuersatz: number;
  kontoNummer: string;
  typ: "eingang" | "ausgang";
  belegdatum: Date;
  belegnummer: string;
  kostenstelleNummer: string;
  gegenkonto: string;
  beschreibung: string | null;
  dokument: string; // leer, wenn kein Beleg (oder Datei fehlt)
}

// Cent -> "1234,56" (Komma als Dezimaltrenner, kein Tausenderpunkt)
export function centZuStr(cent: number): string {
  return (cent / 100).toFixed(2).replace(".", ",");
}

// Aus einem Brutto-Betrag (Cent) den Netto- und den Steueranteil (Cent) bilden.
// Wichtig: netto + steuer ergibt cent-genau wieder den Bruttobetrag,
// damit der Kassenstand exakt erhalten bleibt.
export function nettoUndSteuer(bruttoCent: number, prozent: number): { nettoCent: number; steuerCent: number } {
  if (!prozent) return { nettoCent: bruttoCent, steuerCent: 0 };
  const nettoCent = Math.round(bruttoCent / (1 + prozent / 100));
  const steuerCent = bruttoCent - nettoCent; // Rest, damit Summe exakt stimmt
  return { nettoCent, steuerCent };
}

// Datum -> "JJJJMMTT"
function datumBmd(d: Date): string {
  const j = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${j}${m}${t}`;
}

export function bmdZeile(p: BmdPosition): string {
  // Ausgabe: buchcode 1 (Soll), steuercode 2 (Vorsteuer).
  // Einnahme inkl. Dotierung/Gutschrift: buchcode 2 (Haben), steuercode 1 (USt).
  // Beträge immer positiv, netto und Steuer getrennt.
  const codes = BMD_CODES[p.typ];
  const { nettoCent, steuerCent } = nettoUndSteuer(p.betragCent, p.steuersatz);
  const felder = [
    BMD_FIX.satzart,
    p.kontoNummer,
    p.gegenkonto,
    datumBmd(p.belegdatum),
    p.belegnummer,
    p.kostenstelleNummer,
    String(p.steuersatz).replace(".", ","),
    codes.steuercode,
    codes.buchcode,
    centZuStr(nettoCent),
    centZuStr(steuerCent),
    p.beschreibung ?? "",
    BMD_FIX.buchsymbol,
    p.dokument,
  ];
  return felder.map(csvFeld).join(";");
}

// Gesamte Datei als Latin-1-Buffer (wie bisher für den BMD-Import). Zeichen
// außerhalb von Latin-1 würden sonst zu falschen Bytes: "€" -> "EUR", Rest -> "?".
export function bmdCsv(positionen: BmdPosition[]): Buffer {
  const inhalt = [BMD_SPALTEN.join(";"), ...positionen.map(bmdZeile)].join("\r\n") + "\r\n";
  return Buffer.from(inhalt.replace(/€/g, "EUR").replace(/[\u{100}-\u{10ffff}]/gu, "?"), "latin1");
}
