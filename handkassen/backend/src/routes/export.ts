import { Router } from "express";
import { prisma } from "../lib/db.js";
import { angemeldet, rolleErforderlich } from "../middleware/auth.js";
import {
  KONTEN_MIT_STEUERCODE_00,
  BMD_FIX,
} from "../lib/bmd-zuordnung.js";

export const exportRouter = Router();

// Cent -> "1234,56" (Komma als Dezimaltrenner, kein Tausenderpunkt)
function centZuStr(cent: number): string {
  return (cent / 100).toFixed(2).replace(".", ",");
}

// Aus einem Brutto-Betrag (Cent) den Netto- und den Steueranteil (Cent) bilden.
// Wichtig: netto + steuer ergibt cent-genau wieder den Bruttobetrag,
// damit der Kassenstand exakt erhalten bleibt.
function nettoUndSteuer(bruttoCent: number, prozent: number): { nettoCent: number; steuerCent: number } {
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

// Text BMD-konform: Tabs/Zeilenumbrüche raus (würden die Spalten zerstören)
function textSauber(s: string | null | undefined): string {
  return (s ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

// Datum -> "TT.MM.JJJJ" (für CSV/Excel)
function datumDeCsv(d: Date): string {
  const t = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${t}.${m}.${d.getFullYear()}`;
}

// CSV-Feld escapen (Semikolon-getrennt): bei Sonderzeichen in Anführungszeichen.
function csvFeld(wert: string | number): string {
  const s = String(wert ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// BMD-Buchungssatz-Export als Tab-getrennte .txt (Latin-1, CRLF).
exportRouter.get(
  "/bmd",
  angemeldet,
  rolleErforderlich("finanzen", "admin"),
  async (req, res) => {
    const jahr = Number(req.query.jahr);
    const monat = Number(req.query.monat);
    if (!jahr || !monat) return res.status(400).json({ fehler: "jahr und monat erforderlich." });

    const von = new Date(jahr, monat - 1, 1);
    const bis = new Date(jahr, monat, 1);

    const positionen = await prisma.buchungsPosition.findMany({
      where: {
        buchung: { belegdatum: { gte: von, lt: bis }, storniert: false },
      },
      include: { konto: true, buchung: { include: { kostenstelle: true } } },
      orderBy: [{ buchungId: "asc" }, { id: "asc" }],
    });

    // Pflichtfeld Gegenkonto: keine unvollständige Datei exportieren. Fehlt bei
    // einer betroffenen Kostenstelle das Gegenkonto, wird der Export verweigert.
    const ohneGegenkonto = Array.from(
      new Map(
        positionen
          .filter((p) => !p.buchung.kostenstelle.gegenkonto)
          .map((p) => [p.buchung.kostenstelle.id, p.buchung.kostenstelle])
      ).values()
    );
    if (ohneGegenkonto.length) {
      const namen = ohneGegenkonto.map((k) => `${k.nummer} ${k.bezeichnung}`).join(", ");
      return res.status(400).json({
        fehler: `Für folgende Kostenstelle(n) ist kein Gegenkonto hinterlegt: ${namen}. Bitte in der Verwaltung ergänzen.`,
      });
    }

    const SP = "\t";
    const kopf = [
      "satzart", "konto", "gkonto", "belegdatum", "belegnr", "kost",
      "prozent", "steuercode", "buchcode", "betrag", "steuer", "text", "buchsymbol",
    ].join(SP);

    const zeilen = positionen.map((p) => {
      const b = p.buchung;

      // BMD-kost = offizielle Kostenstellen-Nummer (z. B. "1370"),
      // gepflegt in der Verwaltung -> Kostenstellen.
      const bmdKost = b.kostenstelle.nummer;

      // buchcode + Vorzeichen: Eingang/Einlage = 2 (negativ), Ausgang/Aufwand = 1 (positiv)
      const istEinlage = b.typ === "eingang";
      const buchcode = istEinlage ? "2" : "1";

      // Gegenkonto kommt jetzt aus der Kostenstelle (Verwaltung) – ein Wert
      // für Einlage und Ausgabe gleichermaßen.
      const gkonto = b.kostenstelle.gegenkonto ?? "FEHLT";

      // Brutto (App) -> netto + steuer (BMD)
      const { nettoCent, steuerCent } = nettoUndSteuer(p.betragCent, Number(p.steuersatz));
      // Vorzeichen: Einlagen negativ darstellen (wie in der Musterdatei)
      const vz = istEinlage ? -1 : 1;

      // Steuercode aus Kontozuordnung
      const steuercode = KONTEN_MIT_STEUERCODE_00.has(p.konto.nummer) ? "00" : "02";

      // belegnr = echte Belegnummer der Buchung (mit Jahr, z. B. "2026-1370-01").
      // Beide Positionen einer Buchung tragen damit dieselbe Belegnummer.
      const belegnr = b.belegnummer;

      return [
        BMD_FIX.satzart,
        p.konto.nummer,
        gkonto,
        datumBmd(b.belegdatum),
        belegnr,
        bmdKost,
        String(p.steuersatz),
        steuercode,
        buchcode,
        centZuStr(vz * nettoCent),
        centZuStr(vz * steuerCent),
        textSauber(b.beschreibung),
        BMD_FIX.buchsymbol,
      ].join(SP);
    });

    const inhalt = [kopf, ...zeilen].join("\r\n") + "\r\n";

    // Latin-1 (ISO-8859-1) kodieren, wie die Musterdatei
    const buffer = Buffer.from(inhalt, "latin1");

    res
      .setHeader("Content-Type", "text/plain; charset=iso-8859-1")
      .setHeader("Content-Disposition", `attachment; filename="bmd_ka_${jahr}_${String(monat).padStart(2, "0")}.txt"`)
      .send(buffer);
  }
);

// CSV über ALLE Kassen eines Monats (eine Zeile je Buchung), Excel-freundlich.
// Wie der BMD-Export nur für Finanzen/Admin.
exportRouter.get(
  "/csv",
  angemeldet,
  rolleErforderlich("finanzen", "admin"),
  async (req, res) => {
    const jahr = Number(req.query.jahr);
    const monat = Number(req.query.monat);
    if (!jahr || !monat) return res.status(400).json({ fehler: "jahr und monat erforderlich." });

    const von = new Date(jahr, monat - 1, 1);
    const bis = new Date(jahr, monat, 1);

    const buchungen = await prisma.buchung.findMany({
      where: { belegdatum: { gte: von, lt: bis }, storniert: false },
      include: {
        positionen: { include: { konto: true } },
        kostenstelle: { include: { bereich: true } },
      },
      orderBy: [{ kostenstelleId: "asc" }, { belegdatum: "asc" }, { buchungsnummer: "asc" }],
    });

    const SP = ";";
    const kopf = [
      "Kostenstelle_Nr", "Kostenstelle", "Bereich", "Nr.", "Belegnummer", "Belegdatum",
      "Typ", "Beschreibung", "Konten", "MwSt_EUR", "Betrag_EUR",
    ].join(SP);

    const zeilen = buchungen.map((b) => {
      const mwst = b.positionen.reduce(
        (s, p) => s + nettoUndSteuer(p.betragCent, Number(p.steuersatz)).steuerCent,
        0
      );
      const konten = b.positionen.map((p) => `${p.konto.nummer} (${p.steuersatz}%)`).join(", ");
      const signiert = b.typ === "ausgang" ? -b.betragCent : b.betragCent;
      return [
        csvFeld(b.kostenstelle.nummer),
        csvFeld(b.kostenstelle.bezeichnung),
        csvFeld(b.kostenstelle.bereich.bezeichnung),
        csvFeld(b.buchungsnummer),
        csvFeld(b.belegnummer),
        csvFeld(datumDeCsv(b.belegdatum)),
        csvFeld(b.typ === "ausgang" ? "Ausgang" : "Eingang"),
        csvFeld(b.beschreibung ?? ""),
        csvFeld(konten),
        csvFeld(centZuStr(mwst)),
        csvFeld(centZuStr(signiert)),
      ].join(SP);
    });

    // UTF-8 mit BOM, CRLF (sonst zeigt Excel Umlaute falsch).
    const inhalt = "\uFEFF" + [kopf, ...zeilen].join("\r\n") + "\r\n";

    res
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="buchungen_alle_${jahr}_${String(monat).padStart(2, "0")}.csv"`)
      .send(inhalt);
  }
);
