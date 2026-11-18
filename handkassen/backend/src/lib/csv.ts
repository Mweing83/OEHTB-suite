import { nettoUndSteuer, positionsText, positionsTyp } from "./buchungslogik.js";
import { centZuStr, datumDe } from "./format.js";

// CSV-Feld escapen (Semikolon-getrennt, Excel de-AT): bei Sonderzeichen in
// Anführungszeichen. Zellen, die eine Tabellenkalkulation als Formel auswerten
// würde (= + - @ am Anfang, auch nach Tab/CR/Leerzeichen), werden mit Apostroph
// entschärft und immer gequotet (Security-Audit 2026-10: CSV-Formel-Injektion).
// Reine Beträge wie "-10,00" bleiben unverändert numerisch.
const BETRAG = /^-?\d+(?:,\d+)?$/;

export function csvFeld(wert: string | number): string {
  const s0 = String(wert ?? "").replace(/[\t\r\n]+/g, " ");
  const t = s0.trimStart();
  const formel = /^[=+\-@]/.test(t) && !BETRAG.test(t);
  const s = formel ? "'" + t : s0;
  if (formel || s.includes(";") || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Buchung, wie sie die Excel-CSV braucht (passt auf das Prisma-Ergebnis).
export interface CsvBuchung {
  buchungsnummer: number;
  belegnummer: string;
  belegdatum: Date;
  typ: "eingang" | "ausgang";
  beschreibung: string | null;
  positionen: {
    betragCent: number;
    steuersatz: { toString(): string }; // Prisma-Decimal
    typ: "eingang" | "ausgang" | null;
    text: string | null;
    konto: { nummer: string };
  }[];
  kostenstelle?: { nummer: string; bezeichnung: string; bereich: { bezeichnung: string } };
}

// Excel-CSV der Buchungen – EIN Aufbau für den Bericht je Kostenstelle und den
// Export je Firma (dort zusätzlich mit Kostenstelle und Bereich je Zeile).
// Eine Zeile je Buchungszeile: eine Splitbuchung ergibt mehrere Zeilen mit
// derselben Nummer/Belegnummer, aber eigenem Typ, Text, Konto, MwSt und
// Betrag (Ausgang negativ); die Zeilen ergeben zusammen den Belegbetrag.
// Excel-freundlich (de-AT): Semikolon, Dezimalkomma, UTF-8 mit BOM, CRLF.
export function buchungenAlsCsv(buchungen: CsvBuchung[], mitKostenstelle: boolean): string {
  const kopf = [
    ...(mitKostenstelle ? ["Kostenstelle_Nr", "Kostenstelle", "Bereich"] : []),
    "Nr.", "Belegnummer", "Belegdatum", "Typ", "Beschreibung", "Konto", "MwSt_EUR", "Betrag_EUR",
  ];
  const zeilen = buchungen.flatMap((b) =>
    b.positionen.map((p) => {
      const typ = positionsTyp(p, b.typ);
      const mwst = nettoUndSteuer(p.betragCent, Number(p.steuersatz)).steuerCent;
      return [
        ...(mitKostenstelle && b.kostenstelle
          ? [b.kostenstelle.nummer, b.kostenstelle.bezeichnung, b.kostenstelle.bereich.bezeichnung]
          : []),
        b.buchungsnummer,
        b.belegnummer,
        datumDe(b.belegdatum),
        typ === "ausgang" ? "Ausgang" : "Eingang",
        positionsText(p, b.beschreibung),
        `${p.konto.nummer} (${p.steuersatz}%)`,
        centZuStr(mwst),
        centZuStr(typ === "ausgang" ? -p.betragCent : p.betragCent),
      ]
        .map(csvFeld)
        .join(";");
    })
  );
  return "\uFEFF" + [kopf.join(";"), ...zeilen].join("\r\n") + "\r\n";
}
