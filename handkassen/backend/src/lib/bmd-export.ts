import { csvFeld } from "./csv.js";
import { BMD_CODES, BMD_FIX } from "./bmd-zuordnung.js";
import { nettoUndSteuer } from "./buchungslogik.js";
import { centZuStr } from "./format.js";

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
