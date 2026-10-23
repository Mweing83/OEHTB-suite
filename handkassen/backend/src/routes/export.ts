import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { prisma } from "../lib/db.js";
import { csvFeld } from "../lib/csv.js";
import { angemeldet, rolleErforderlich } from "../middleware/auth.js";
import { UPLOAD_DIR } from "../lib/uploads.js";
import { bmdCsv, centZuStr, nettoUndSteuer } from "../lib/bmd-export.js";

export const exportRouter = Router();

// Datum -> "TT.MM.JJJJ" (für CSV/Excel)
function datumDeCsv(d: Date): string {
  const t = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${t}.${m}.${d.getFullYear()}`;
}

// CSV-Feld escapen inkl. Formel-Neutralisierung: siehe lib/csv.ts.

// Zahlen aus der Query prüfen (jahr/monat), sonst null.
function monatAusQuery(q: Record<string, unknown>): { jahr: number; monat: number } | null {
  const jahr = Number(q.jahr);
  const monat = Number(q.monat);
  if (!Number.isInteger(jahr) || !Number.isInteger(monat) || monat < 1 || monat > 12 || jahr < 2000) return null;
  return { jahr, monat };
}

type BmdDaten =
  | { fehler: string }
  | { csv: Buffer; dateiname: string; belege: { name: string; pfad: string }[]; fehlend: string[] };

// Lädt alle Positionen des Monats und baut die BMD-CSV. Liefert zusätzlich die
// Belegdateien für den ZIP-Export. Der Name in der Spalte "dokument" ist exakt
// der Dateiname im Upload-Ordner und im ZIP (Belegnummer + Endung, eindeutig).
async function bmdDatenLaden(jahr: number, monat: number): Promise<BmdDaten> {
  const von = new Date(jahr, monat - 1, 1);
  const bis = new Date(jahr, monat, 1);

  const positionen = await prisma.buchungsPosition.findMany({
    where: {
      buchung: { belegdatum: { gte: von, lt: bis }, storniert: false },
    },
    include: { konto: true, buchung: { include: { kostenstelle: true, beleg: true } } },
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
    return {
      fehler: `Für folgende Kostenstelle(n) ist kein Gegenkonto hinterlegt: ${namen}. Bitte in der Verwaltung ergänzen.`,
    };
  }

  // Belegdateien je Buchung einmal prüfen. Fehlt die Datei am Server, bleibt
  // "dokument" leer (CSV und ZIP stimmen so immer überein) und die Belegnummer
  // wird gemeldet.
  const belege = new Map<number, { name: string; pfad: string }>();
  const fehlend: string[] = [];
  for (const p of positionen) {
    const b = p.buchung;
    if (!b.beleg || belege.has(b.id) || fehlend.includes(b.belegnummer)) continue;
    const name = path.basename(b.beleg.dateipfad);
    const pfad = path.join(UPLOAD_DIR, name);
    if (fs.existsSync(pfad)) belege.set(b.id, { name, pfad });
    else fehlend.push(b.belegnummer);
  }

  const csv = bmdCsv(
    positionen.map((p) => ({
      betragCent: p.betragCent,
      steuersatz: Number(p.steuersatz),
      kontoNummer: p.konto.nummer,
      typ: p.buchung.typ,
      belegdatum: p.buchung.belegdatum,
      // belegnr = echte Belegnummer der Buchung (z. B. "2026-1370-01");
      // alle Positionen einer Buchung tragen dieselbe Belegnummer.
      belegnummer: p.buchung.belegnummer,
      // kost = offizielle Kostenstellen-Nummer (Verwaltung -> Kostenstellen)
      kostenstelleNummer: p.buchung.kostenstelle.nummer,
      gegenkonto: p.buchung.kostenstelle.gegenkonto!,
      beschreibung: p.buchung.beschreibung,
      dokument: belege.get(p.buchung.id)?.name ?? "",
    }))
  );

  const dateiname = `bmd_ka_${jahr}_${String(monat).padStart(2, "0")}`;
  return { csv, dateiname, belege: Array.from(belege.values()), fehlend };
}

// BMD-Buchungssatz-Datei als CSV (Semikolon, Latin-1, CRLF).
exportRouter.get(
  "/bmd",
  angemeldet,
  rolleErforderlich("finanzen", "admin"),
  async (req, res) => {
    const m = monatAusQuery(req.query);
    if (!m) return res.status(400).json({ fehler: "jahr und monat erforderlich." });
    const daten = await bmdDatenLaden(m.jahr, m.monat);
    if ("fehler" in daten) return res.status(400).json({ fehler: daten.fehler });

    res
      .setHeader("Content-Type", "text/csv; charset=iso-8859-1")
      .setHeader("Content-Disposition", `attachment; filename="${daten.dateiname}.csv"`)
      .send(daten.csv);
  }
);

// BMD-CSV plus alle Belegdateien des Monats als ZIP. Die Belege liegen neben
// der CSV im Wurzelverzeichnis, mit exakt dem Namen aus der Spalte "dokument".
// Fehlende Dateien stehen in FEHLENDE_BELEGE.txt.
exportRouter.get(
  "/bmd-zip",
  angemeldet,
  rolleErforderlich("finanzen", "admin"),
  async (req, res) => {
    const m = monatAusQuery(req.query);
    if (!m) return res.status(400).json({ fehler: "jahr und monat erforderlich." });
    const daten = await bmdDatenLaden(m.jahr, m.monat);
    if ("fehler" in daten) return res.status(400).json({ fehler: daten.fehler });

    res
      .setHeader("Content-Type", "application/zip")
      .setHeader("Content-Disposition", `attachment; filename="${daten.dateiname}.zip"`);

    const zip = new Zip((err, chunk, final) => {
      if (err) {
        console.error("BMD-ZIP fehlgeschlagen:", err);
        res.destroy(err);
        return;
      }
      res.write(chunk);
      if (final) res.end();
    });

    const csv = new ZipDeflate(`${daten.dateiname}.csv`, { level: 6 });
    zip.add(csv);
    csv.push(daten.csv, true);

    if (daten.fehlend.length) {
      const hinweis = new ZipDeflate("FEHLENDE_BELEGE.txt", { level: 6 });
      zip.add(hinweis);
      const text =
        "Für diese Buchungen ist ein Beleg erfasst, die Datei fehlt aber am Server:\r\n" +
        daten.fehlend.join("\r\n") + "\r\n";
      hinweis.push(Buffer.from(text, "utf8"), true);
    }

    try {
      // Bilder/PDFs sind bereits komprimiert: unverändert ablegen.
      for (const beleg of daten.belege) {
        const eintrag = new ZipPassThrough(beleg.name);
        zip.add(eintrag);
        for await (const stueck of fs.createReadStream(beleg.pfad)) eintrag.push(stueck as Buffer);
        eintrag.push(new Uint8Array(0), true);
      }
      zip.end();
    } catch (e) {
      console.error("BMD-ZIP: Beleg konnte nicht gelesen werden:", e);
      res.destroy(e as Error);
    }
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
