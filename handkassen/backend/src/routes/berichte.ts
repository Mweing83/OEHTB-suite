import { Router } from "express";
import { prisma } from "../lib/db.js";
import { angemeldet, darfKostenstelle } from "../middleware/auth.js";
import {
  neuesDokumentMitKopf,
  fusszeile,
  eur,
  datumDe,
  zeitraumText,
  enthalteneSteuerCent,
} from "../lib/pdf.js";

export const berichtRouter = Router();

// Ermittelt den Zeitraum aus der Anfrage:
//   entweder ?jahr=2026&monat=5  ODER  ?von=2026-05-01&bis=2026-05-31
// Rückgabe: { von, bis (exklusiv), label }
function zeitraumAusQuery(req: any): { von: Date; bis: Date; label: string } | null {
  const jahr = Number(req.query.jahr);
  const monat = Number(req.query.monat);
  if (jahr && monat) {
    const von = new Date(jahr, monat - 1, 1);
    const bis = new Date(jahr, monat, 1); // erster Tag des Folgemonats (exklusiv)
    return { von, bis, label: zeitraumText(von, bis) };
  }
  const vonStr = req.query.von as string | undefined;
  const bisStr = req.query.bis as string | undefined;
  if (vonStr && bisStr) {
    const von = new Date(vonStr);
    // bis inklusiv gewünscht -> exklusiv = Folgetag
    const bisInkl = new Date(bisStr);
    const bis = new Date(bisInkl.getTime() + 24 * 60 * 60 * 1000);
    if (isNaN(von.getTime()) || isNaN(bisInkl.getTime())) return null;
    return { von, bis, label: zeitraumText(von, bis) };
  }
  return null;
}

// Gemeinsame Vorarbeit: Zugriff prüfen, Kostenstelle + Buchungen laden.
async function ladeDaten(req: any, res: any) {
  const kostenstelleId = Number(req.query.kostenstelle);
  if (!kostenstelleId) {
    res.status(400).json({ fehler: "Parameter 'kostenstelle' erforderlich." });
    return null;
  }
  if (!(await darfKostenstelle(req.benutzer!, kostenstelleId))) {
    res.status(403).json({ fehler: "Kein Zugriff auf diese Kostenstelle." });
    return null;
  }
  const zeitraum = zeitraumAusQuery(req);
  if (!zeitraum) {
    res.status(400).json({ fehler: "Zeitraum erforderlich: entweder jahr+monat oder von+bis." });
    return null;
  }

  const kostenstelle = await prisma.kostenstelle.findUnique({ where: { id: kostenstelleId }, include: { bereich: true } });
  if (!kostenstelle) {
    res.status(404).json({ fehler: "Kostenstelle nicht gefunden." });
    return null;
  }

  const buchungen = await prisma.buchung.findMany({
    where: {
      kostenstelleId,
      storniert: false,
      belegdatum: { gte: zeitraum.von, lt: zeitraum.bis },
    },
    include: { positionen: { include: { konto: true } } },
    orderBy: [{ belegdatum: "asc" }, { buchungsnummer: "asc" }],
  });

  return { kostenstelle, buchungen, zeitraum };
}

// Saldo aus Buchungen (Eingang +, Ausgang -)
function saldoCent(buchungen: { typ: string; betragCent: number }[]): number {
  return buchungen.reduce((s, b) => s + (b.typ === "eingang" ? b.betragCent : -b.betragCent), 0);
}

// ============================================================
//  1) KASSABERICHT (Einnahmen und Ausgaben, Zusammenfassung)
// ============================================================
berichtRouter.get("/kassabericht", angemeldet, async (req, res) => {
  const daten = await ladeDaten(req, res);
  if (!daten) return;
  const { kostenstelle, buchungen, zeitraum } = daten;

  const doc = neuesDokumentMitKopf({
    titel: "Kassabericht (Einnahmen und Ausgaben)",
    kostenstelle: kostenstelle.bezeichnung,
    bereich: kostenstelle.bereich.bezeichnung,
    zeitraum: zeitraum.label,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="kassabericht.pdf"`);
  doc.pipe(res);

  const einnahmen = buchungen.filter((b) => b.typ === "eingang");
  const ausgaben = buchungen.filter((b) => b.typ === "ausgang");
  const summeEin = einnahmen.reduce((s, b) => s + b.betragCent, 0);
  const summeAus = ausgaben.reduce((s, b) => s + b.betragCent, 0);
  const anfang = kostenstelle.anfangssaldoCent;
  const endsaldo = anfang + summeEin - summeAus;

  doc.fontSize(11).font("Helvetica");

  // Zusammenfassung als einfache Werteliste
  const zeile = (label: string, wert: string, fett = false) => {
    doc.font(fett ? "Helvetica-Bold" : "Helvetica");
    const y = doc.y;
    doc.text(label, 50, y, { width: 300 });
    doc.text(wert, 350, y, { width: doc.page.width - 50 - 350, align: "right" });
    doc.moveDown(0.6);
  };

  zeile("Anfangssaldo (Startbestand)", eur(anfang));
  zeile(`Summe Einnahmen (${einnahmen.length} Buchungen)`, eur(summeEin));
  zeile(`Summe Ausgaben (${ausgaben.length} Buchungen)`, "- " + eur(summeAus));

  doc.moveDown(0.2);
  const y = doc.y;
  doc.strokeColor("#BFBFBF").lineWidth(1).moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();
  doc.moveDown(0.6);

  zeile("Rechnerischer Endsaldo", eur(endsaldo), true);

  doc.moveDown(1);
  doc.fontSize(9).fillColor("#808080").font("Helvetica");
  doc.text(
    "Hinweis: Der rechnerische Endsaldo ergibt sich aus Anfangssaldo + Einnahmen - Ausgaben " +
      "für den gewählten Zeitraum. Stornierte Buchungen sind nicht enthalten.",
    50,
    doc.y,
    { width: doc.page.width - 100 }
  );

  fusszeile(doc, 1);
  doc.end();
});

// ============================================================
//  2) DETAILBERICHT (alle Buchungen der Kassa, tabellarisch)
// ============================================================
berichtRouter.get("/detailbericht", angemeldet, async (req, res) => {
  const daten = await ladeDaten(req, res);
  if (!daten) return;
  const { kostenstelle, buchungen, zeitraum } = daten;

  const doc = neuesDokumentMitKopf({
    titel: "Detailbericht – Buchungen der Kassa",
    kostenstelle: kostenstelle.bezeichnung,
    bereich: kostenstelle.bereich.bezeichnung,
    zeitraum: zeitraum.label,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="detailbericht.pdf"`);
  doc.pipe(res);

  let seite = 1;

  // Spalten (x-Positionen und Breiten)
  const spalten = [
    { titel: "Nr.", x: 50, w: 30, align: "left" as const },
    { titel: "Beleg-Nr.", x: 80, w: 78, align: "left" as const },
    { titel: "Datum", x: 158, w: 52, align: "left" as const },
    { titel: "Beschreibung / Konto", x: 210, w: 165, align: "left" as const },
    { titel: "MwSt", x: 375, w: 70, align: "right" as const },
    { titel: "Betrag", x: 445, w: 100, align: "right" as const },
  ];

  function kopfzeile() {
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#000000");
    const y = doc.y;
    for (const s of spalten) doc.text(s.titel, s.x, y, { width: s.w, align: s.align });
    doc.moveDown(0.3);
    const ly = doc.y;
    doc.strokeColor("#BFBFBF").lineWidth(0.5).moveTo(50, ly).lineTo(doc.page.width - 50, ly).stroke();
    doc.moveDown(0.3);
  }

  function seitenumbruchPruefen() {
    if (doc.y > doc.page.height - 70) {
      fusszeile(doc, seite);
      doc.addPage();
      seite++;
      kopfzeile();
    }
  }

  kopfzeile();
  doc.fontSize(9).font("Helvetica");

  for (const b of buchungen) {
    seitenumbruchPruefen();
    const mwst = b.positionen.reduce((s, p) => s + enthalteneSteuerCent(p.betragCent, p.steuersatz), 0);
    const konten = b.positionen.map((p) => `${p.konto.nummer} (${p.steuersatz}%)`).join(", ");
    const beschreibung = (b.beschreibung ? b.beschreibung + " — " : "") + konten;
    const vorzeichen = b.typ === "ausgang" ? "- " : "+ ";

    const y = doc.y;
    doc.font("Helvetica").fillColor("#000000");
    doc.text(String(b.buchungsnummer), spalten[0].x, y, { width: spalten[0].w });
    doc.text(b.belegnummer, spalten[1].x, y, { width: spalten[1].w });
    doc.text(datumDe(b.belegdatum), spalten[2].x, y, { width: spalten[2].w });
    doc.text(beschreibung, spalten[3].x, y, { width: spalten[3].w });
    doc.text(eur(mwst), spalten[4].x, y, { width: spalten[4].w, align: "right" });
    doc.text(vorzeichen + eur(b.betragCent), spalten[5].x, y, { width: spalten[5].w, align: "right" });
    doc.moveDown(0.5);
  }

  // Summenzeile
  seitenumbruchPruefen();
  const summeEin = buchungen.filter((b) => b.typ === "eingang").reduce((s, b) => s + b.betragCent, 0);
  const summeAus = buchungen.filter((b) => b.typ === "ausgang").reduce((s, b) => s + b.betragCent, 0);

  doc.moveDown(0.3);
  const ly = doc.y;
  doc.strokeColor("#BFBFBF").lineWidth(0.5).moveTo(50, ly).lineTo(doc.page.width - 50, ly).stroke();
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text(`Einnahmen: ${eur(summeEin)}    Ausgaben: ${eur(summeAus)}    Saldo (Zeitraum): ${eur(summeEin - summeAus)}`,
    50, doc.y, { width: doc.page.width - 100, align: "right" });

  fusszeile(doc, seite);
  doc.end();
});

// ============================================================
//  3) ZÄHLLISTE (Soll/Ist-Abgleich des Kassenbestands)
// ============================================================
berichtRouter.get("/zaehlliste", angemeldet, async (req, res) => {
  const daten = await ladeDaten(req, res);
  if (!daten) return;
  const { kostenstelle, buchungen, zeitraum } = daten;

  // Soll-Bestand am Periodenende = Anfangssaldo + Saldo der Buchungen
  const soll = kostenstelle.anfangssaldoCent + saldoCent(buchungen);

  // Falls für den Monat ein Abschluss mit gezähltem Ist existiert, diesen zeigen
  const jahr = Number(req.query.jahr);
  const monat = Number(req.query.monat);
  let istCent: number | null = null;
  if (jahr && monat) {
    const abschluss = await prisma.abschluss.findUnique({
      where: { kostenstelleId_jahr_monat: { kostenstelleId: kostenstelle.id, jahr, monat } },
    });
    if (abschluss) istCent = abschluss.zaehllisteCent;
  }

  const doc = neuesDokumentMitKopf({
    titel: "Zählliste (Kassenbestand)",
    kostenstelle: kostenstelle.bezeichnung,
    bereich: kostenstelle.bereich.bezeichnung,
    zeitraum: zeitraum.label,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="zaehlliste.pdf"`);
  doc.pipe(res);

  doc.fontSize(11).font("Helvetica");
  const zeile = (label: string, wert: string, fett = false) => {
    doc.font(fett ? "Helvetica-Bold" : "Helvetica");
    const y = doc.y;
    doc.text(label, 50, y, { width: 320 });
    doc.text(wert, 370, y, { width: doc.page.width - 50 - 370, align: "right" });
    doc.moveDown(0.7);
  };

  zeile("Rechnerischer Soll-Bestand", eur(soll), true);
  if (istCent !== null) {
    zeile("Gezählter Ist-Bestand (Zählliste)", eur(istCent));
    const diff = istCent - soll;
    zeile("Differenz (Ist - Soll)", (diff >= 0 ? "" : "- ") + eur(Math.abs(diff)), true);
    if (diff !== 0) {
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#B00020").font("Helvetica-Bold");
      doc.text("Achtung: Soll und Ist stimmen nicht überein.", 50, doc.y, { width: doc.page.width - 100 });
      doc.fillColor("#000000");
    }
  } else {
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#808080").font("Helvetica");
    doc.text(
      "Für diesen Zeitraum wurde noch kein gezählter Ist-Bestand erfasst. " +
        "Tragen Sie den gezählten Bargeldbestand unten ein und vergleichen Sie ihn mit dem Soll-Bestand.",
      50,
      doc.y,
      { width: doc.page.width - 100 }
    );
    doc.fillColor("#000000");
  }

  // Handschriftliches Zählfeld
  doc.moveDown(2);
  doc.fontSize(11).font("Helvetica-Bold").text("Bargeldzählung vor Ort:");
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica");
  doc.text("Gezählter Bestand: ____________________ €", { continued: false });
  doc.moveDown(1);
  doc.text("Datum: ________________     Unterschrift: ________________________");

  fusszeile(doc, 1);
  doc.end();
});

// ============================================================
//  4) CSV-EXPORT (Buchungen tabellarisch, fuer Excel)
// ============================================================
berichtRouter.get("/csv", angemeldet, async (req, res) => {
  const daten = await ladeDaten(req, res);
  if (!daten) return;
  const { kostenstelle, buchungen, zeitraum } = daten;

  // Excel-freundlich (de-AT): Semikolon als Trenner, Komma als Dezimaltrennzeichen,
  // UTF-8 mit BOM (sonst zeigt Excel Umlaute falsch), Zeilenende CRLF.
  const TRENN = ";";
  const betrag = (cent: number) => (cent / 100).toFixed(2).replace(".", ",");
  const feld = (wert: string | number): string => {
    const s = String(wert ?? "");
    if (s.includes(TRENN) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const kopf = ["Nr.", "Belegnummer", "Belegdatum", "Typ", "Beschreibung", "Konten", "MwSt_EUR", "Betrag_EUR"];
  const zeilen: string[] = [kopf.join(TRENN)];

  for (const b of buchungen) {
    const mwst = b.positionen.reduce((s, p) => s + enthalteneSteuerCent(p.betragCent, p.steuersatz), 0);
    const konten = b.positionen.map((p) => `${p.konto.nummer} (${p.steuersatz}%)`).join(", ");
    const signiert = b.typ === "ausgang" ? -b.betragCent : b.betragCent;
    zeilen.push(
      [
        feld(b.buchungsnummer),
        feld(b.belegnummer),
        feld(datumDe(b.belegdatum)),
        feld(b.typ === "ausgang" ? "Ausgang" : "Eingang"),
        feld(b.beschreibung ?? ""),
        feld(konten),
        feld(betrag(mwst)),
        feld(betrag(signiert)),
      ].join(TRENN)
    );
  }

  const inhalt = "\uFEFF" + zeilen.join("\r\n") + "\r\n";

  // Dateiname aus Kostenstelle + Zeitraum, auf sichere Zeichen reduziert.
  const sicher = (s: string) => s.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  const dateiname = `buchungen_${sicher(kostenstelle.nummer)}_${sicher(zeitraum.label)}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${dateiname}"`);
  res.send(inhalt);
});
