// Gemeinsame Bausteine für die PDF-Berichte (auf Basis von pdfkit).
// Enthält Briefkopf (mit optionalem Logo), Fußzeile und Geld-/Datumsformat.

import PDFDocument from "pdfkit";
import path from "node:path";
import fs from "node:fs";

const ASSETS_DIR = path.resolve("assets");
// Logo automatisch finden: JPG wird von pdfkit am zuverlässigsten dargestellt,
// daher zuerst logo.jpg, dann logo.png als Alternative.
function logoPfadFinden(): string | null {
  for (const name of ["logo.jpg", "logo.jpeg", "logo.png"]) {
    const p = path.join(ASSETS_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export const ORGANISATION = "ÖHTB Wohnen GmbH";

// Geldformat: Cent -> "1.234,56 €"
export function eur(cent: number): string {
  return (cent / 100).toLocaleString("de-AT", { style: "currency", currency: "EUR" });
}

// Datum -> "01.05.2026"
export function datumDe(d: Date): string {
  return d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Zeitraum-Beschriftung
export function zeitraumText(von: Date, bis: Date): string {
  // bis ist exklusiv (erster Tag des Folgemonats) -> für die Anzeige -1 Tag
  const bisAnzeige = new Date(bis.getTime() - 24 * 60 * 60 * 1000);
  return `${datumDe(von)} – ${datumDe(bisAnzeige)}`;
}

interface KopfInfo {
  titel: string;
  kostenstelle: string;
  bereich?: string;
  zeitraum: string;
}

// Erzeugt ein neues PDF-Dokument im A4-Format und zeichnet den Briefkopf.
export function neuesDokumentMitKopf(info: KopfInfo): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  const blau = "#1F4E79";
  const grau = "#595959";

  // Logo (falls vorhanden) oben rechts
  const logoPfad = logoPfadFinden();
  if (logoPfad) {
    try {
      doc.image(logoPfad, doc.page.width - 50 - 120, 45, { fit: [120, 50] });
    } catch {
      // Logo defekt o. Ä. -> ignorieren, Textkopf reicht
    }
  }

  // Organisation + Titel links
  doc.fillColor(blau).fontSize(18).font("Helvetica-Bold").text(ORGANISATION, 50, 50);
  doc.moveDown(0.2);
  doc.fillColor("#000000").fontSize(14).font("Helvetica-Bold").text(info.titel);

  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica").fillColor(grau);
  const bereich = info.bereich ? ` (${info.bereich})` : "";
  doc.text(`Kostenstelle: ${info.kostenstelle}${bereich}`);
  doc.text(`Zeitraum: ${info.zeitraum}`);
  doc.text(`Erstellt am: ${datumDe(new Date())}`);

  // Trennlinie
  doc.moveDown(0.5);
  const y = doc.y + 4;
  doc.strokeColor("#BFBFBF").lineWidth(1).moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();
  doc.moveDown(1);
  doc.fillColor("#000000");

  return doc;
}

// Zeichnet eine einfache Fußzeile mit Seitenzahl auf die aktuelle Seite.
export function fusszeile(doc: PDFKit.PDFDocument, seite: number) {
  const unten = doc.page.height - 40;
  // Wichtig: Die Fußzeile liegt bewusst im unteren Seitenrand. Würde man dort
  // ohne Schutz schreiben, legt pdfkit automatisch eine neue (leere) Seite an,
  // weil die Position unterhalb des Satzspiegels liegt. Deshalb den unteren
  // Rand für das Schreiben der Fußzeile kurz auf 0 setzen und danach zurück.
  const alterRand = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.fontSize(8).fillColor("#808080").font("Helvetica");
  doc.text(
    `${ORGANISATION} – erstellt mit dem Handkassen-System`,
    50,
    unten,
    { align: "left", width: doc.page.width - 100, lineBreak: false }
  );
  doc.text(`Seite ${seite}`, 50, unten, { align: "right", width: doc.page.width - 100, lineBreak: false });
  doc.page.margins.bottom = alterRand;
}

// Hilfsfunktion: enthaltene MwSt aus Bruttobetrag (Cent) herausrechnen.
export function enthalteneSteuerCent(bruttoCent: number, steuersatz: number): number {
  if (!steuersatz) return 0;
  const netto = bruttoCent / (1 + steuersatz / 100);
  return Math.round(bruttoCent - netto);
}
