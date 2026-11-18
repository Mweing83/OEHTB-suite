import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { audit } from "../../lib/audit.js";

// Teil der Admin-Routen. Anmeldung und Admin-Rolle prüft routes/admin.ts,
// bevor dieser Router eingehängt wird – nicht eigenständig einhängen.
export const stammdatenRouter = Router();

// ============================================================
//  FIRMEN (Mandanten)
// ============================================================

stammdatenRouter.get("/firmen", async (_req, res) => {
  const firmen = await prisma.firma.findMany({ orderBy: { id: "asc" } });
  res.json(firmen);
});

const firmaSchema = z.object({ name: z.string().trim().min(1).max(200) });

stammdatenRouter.post("/firmen", async (req, res) => {
  const parse = firmaSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Bitte einen Namen eingeben." });
  if (await prisma.firma.findUnique({ where: { name: parse.data.name } })) {
    return res.status(409).json({ fehler: "Diese Firma gibt es bereits." });
  }
  const firma = await prisma.firma.create({ data: { name: parse.data.name } });
  await audit({ benutzerId: req.benutzer!.id, aktion: "firma.erstellt", entitaet: "firma", entitaetId: firma.id, neueWerte: firma });
  res.status(201).json(firma);
});

stammdatenRouter.put("/firmen/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parse = firmaSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0 || !parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const alt = await prisma.firma.findUnique({ where: { id } });
  if (!alt) return res.status(404).json({ fehler: "Nicht gefunden." });
  const kollision = await prisma.firma.findFirst({ where: { name: parse.data.name, id: { not: id } } });
  if (kollision) return res.status(409).json({ fehler: "Diese Firma gibt es bereits." });
  const firma = await prisma.firma.update({ where: { id }, data: { name: parse.data.name } });
  await audit({ benutzerId: req.benutzer!.id, aktion: "firma.bearbeitet", entitaet: "firma", entitaetId: id, alteWerte: alt, neueWerte: firma });
  res.json(firma);
});

// Firma muss existieren (FK) – verständliche 400 statt 500.
export async function firmaVorhanden(firmaId: number): Promise<boolean> {
  return !!(await prisma.firma.findUnique({ where: { id: firmaId } }));
}

// ============================================================
//  KOSTENSTELLEN
// ============================================================

stammdatenRouter.get("/kostenstellen", async (_req, res) => {
  const ks = await prisma.kostenstelle.findMany({
    include: { bereich: true, kassenart: true, firma: true },
    orderBy: { bezeichnung: "asc" },
  });
  res.json(ks);
});

const ksSchema = z.object({
  firmaId: z.number().int().positive(),
  nummer: z.string().min(1),
  bezeichnung: z.string().min(1),
  gegenkonto: z.string().min(1),
  bereichId: z.number().int(),
  kassenartId: z.number().int(),
  anfangssaldoCent: z.number().int().optional(),
  belegStartnummer: z.number().int().positive().optional(),
  belegStartJahr: z.number().int().optional(),
});

stammdatenRouter.post("/kostenstellen", async (req, res) => {
  const parse = ksSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const vorhanden = await prisma.kostenstelle.findUnique({ where: { nummer: parse.data.nummer } });
  if (vorhanden) return res.status(409).json({ fehler: "Diese Kostenstellen-Nummer ist bereits vergeben." });
  if (!(await firmaVorhanden(parse.data.firmaId))) return res.status(400).json({ fehler: "Unbekannte Firma." });
  const anfang = parse.data.anfangssaldoCent ?? 0;
  const ks = await prisma.kostenstelle.create({
    data: { ...parse.data, anfangssaldoCent: anfang, saldoCent: anfang },
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "kostenstelle.erstellt", entitaet: "kostenstelle", entitaetId: ks.id, neueWerte: ks });
  res.status(201).json(ks);
});

// Bearbeiten inkl. Anfangssaldo. Bei Änderung des Anfangssaldos wird der
// laufende Saldo um die Differenz korrigiert (Startbestand verschiebt sich).
// Bearbeiten: alle Felder optional, aber typgeprueft (vorher ungeprueft ->
// 500er bei falschen Typen).
const ksUpdateSchema = z.object({
  firmaId: z.number().int().positive().optional(),
  nummer: z.string().min(1).optional(),
  bezeichnung: z.string().min(1).optional(),
  gegenkonto: z.string().optional(),
  bereichId: z.number().int().positive().optional(),
  kassenartId: z.number().int().positive().optional(),
  anfangssaldoCent: z.number().int().optional(),
  belegStartnummer: z.number().int().positive().nullable().optional(),
  belegStartJahr: z.number().int().min(2000).max(2100).nullable().optional(),
});

stammdatenRouter.put("/kostenstellen/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ fehler: "Ungültige Kostenstelle." });
  const parse = ksUpdateSchema.safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const { firmaId, nummer, bezeichnung, gegenkonto, bereichId, kassenartId, anfangssaldoCent, belegStartnummer, belegStartJahr } = parse.data;
  const alt = await prisma.kostenstelle.findUnique({ where: { id } });
  if (!alt) return res.status(404).json({ fehler: "Nicht gefunden." });

  // Firmenwechsel (nur Admin, wie der ganze Router): auch mit Buchungen
  // erlaubt, damit Bestand/Testdaten umgehängt werden können – aber nicht,
  // sobald ein Monat freigegeben ist (abgeschlossen, ggf. schon exportiert).
  if (typeof firmaId === "number" && firmaId !== alt.firmaId) {
    if (!(await firmaVorhanden(firmaId))) return res.status(400).json({ fehler: "Unbekannte Firma." });
    const [gesperrt, freigegeben] = await Promise.all([
      prisma.buchung.count({ where: { kostenstelleId: id, gesperrt: true } }),
      prisma.abschluss.count({
        where: { kostenstelleId: id, OR: [{ status: "freigegeben" }, { freigegebenAm: { not: null } }] },
      }),
    ]);
    if (gesperrt > 0 || freigegeben > 0) {
      return res.status(409).json({
        fehler: "Die Firma kann nach der ersten Monatsfreigabe dieser Kostenstelle nicht mehr geändert werden.",
      });
    }
  }

  // Der Anfangssaldo fliesst in Soll/Endsaldo aller Perioden ein. Nach der
  // ersten Freigabe wuerde eine Aenderung abgeschlossene Monate nachtraeglich
  // veraendern – daher dann gesperrt (Revisionssicherheit).
  if (typeof anfangssaldoCent === "number" && anfangssaldoCent !== alt.anfangssaldoCent) {
    const freigegeben = await prisma.abschluss.count({
      where: { kostenstelleId: id, OR: [{ status: "freigegeben" }, { freigegebenAm: { not: null } }] },
    });
    if (freigegeben > 0) {
      return res.status(409).json({
        fehler: "Der Anfangssaldo kann nach der ersten Monatsfreigabe nicht mehr geändert werden.",
      });
    }
  }

  // Falls die Nummer geändert wird: Eindeutigkeit prüfen.
  if (typeof nummer === "string" && nummer !== alt.nummer) {
    const kollision = await prisma.kostenstelle.findFirst({ where: { nummer, id: { not: id } } });
    if (kollision) return res.status(409).json({ fehler: "Diese Kostenstellen-Nummer ist bereits vergeben." });
  }

  // Gegenkonto ist Pflicht (steuert den BMD-Export): falls mitgesendet, darf es nicht leer sein.
  if (gegenkonto !== undefined && (typeof gegenkonto !== "string" || !gegenkonto.trim())) {
    return res.status(400).json({ fehler: "Bitte ein Gegenkonto (BMD) eingeben." });
  }

  const neuerAnfang = typeof anfangssaldoCent === "number" ? anfangssaldoCent : alt.anfangssaldoCent;
  const differenz = neuerAnfang - alt.anfangssaldoCent;

  const ks = await prisma.kostenstelle.update({
    where: { id },
    data: {
      firmaId: typeof firmaId === "number" ? firmaId : alt.firmaId,
      nummer: typeof nummer === "string" && nummer ? nummer : alt.nummer,
      bezeichnung: bezeichnung ?? alt.bezeichnung,
      gegenkonto: typeof gegenkonto === "string" && gegenkonto.trim() ? gegenkonto.trim() : alt.gegenkonto,
      bereichId: typeof bereichId === "number" ? bereichId : alt.bereichId,
      kassenartId: typeof kassenartId === "number" ? kassenartId : alt.kassenartId,
      anfangssaldoCent: neuerAnfang,
      saldoCent: { increment: differenz },
      belegStartnummer: belegStartnummer === undefined ? alt.belegStartnummer : belegStartnummer,
      belegStartJahr: belegStartJahr === undefined ? alt.belegStartJahr : belegStartJahr,
    },
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "kostenstelle.bearbeitet", entitaet: "kostenstelle", entitaetId: id, alteWerte: alt, neueWerte: ks });
  res.json(ks);
});

// ============================================================
//  BEREICHE und KASSENARTEN (einfache Stammwerte für Kostenstellen)
// ============================================================

const stammwertSchema = z.object({ bezeichnung: z.string().min(1) });

// Bereiche und Kassenarten sind gleich aufgebaut (id, bezeichnung, aktiv):
// Liste, Anlegen und Umbenennen laufen über denselben Code.
function stammwertRouten(
  pfad: string,
  entitaet: "bereich" | "kassenart",
  doppeltMeldung: string,
  db: {
    alle: () => Promise<unknown[]>;
    finde: (bezeichnung: string, ohneId?: number) => Promise<unknown | null>;
    anlegen: (bezeichnung: string) => Promise<{ id: number }>;
    umbenennen: (id: number, bezeichnung: string) => Promise<{ id: number }>;
  }
) {
  stammdatenRouter.get(pfad, async (_req, res) => {
    res.json(await db.alle());
  });

  stammdatenRouter.post(pfad, async (req, res) => {
    const parse = stammwertSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
    if (await db.finde(parse.data.bezeichnung)) return res.status(409).json({ fehler: doppeltMeldung });
    const wert = await db.anlegen(parse.data.bezeichnung);
    await audit({ benutzerId: req.benutzer!.id, aktion: `${entitaet}.erstellt`, entitaet, entitaetId: wert.id, neueWerte: wert });
    res.status(201).json(wert);
  });

  stammdatenRouter.put(`${pfad}/:id`, async (req, res) => {
    const id = Number(req.params.id);
    const parse = stammwertSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
    // Eindeutigkeit: keine zweite Zeile mit gleicher Bezeichnung
    if (await db.finde(parse.data.bezeichnung, id)) return res.status(409).json({ fehler: doppeltMeldung });
    const wert = await db.umbenennen(id, parse.data.bezeichnung);
    await audit({ benutzerId: req.benutzer!.id, aktion: `${entitaet}.bearbeitet`, entitaet, entitaetId: id, neueWerte: wert });
    res.json(wert);
  });
}

stammwertRouten("/bereiche", "bereich", "Dieser Bereich existiert bereits.", {
  alle: () => prisma.bereich.findMany({ orderBy: { bezeichnung: "asc" } }),
  finde: (bezeichnung, ohneId) =>
    prisma.bereich.findFirst({ where: { bezeichnung, ...(ohneId ? { id: { not: ohneId } } : {}) } }),
  anlegen: (bezeichnung) => prisma.bereich.create({ data: { bezeichnung } }),
  umbenennen: (id, bezeichnung) => prisma.bereich.update({ where: { id }, data: { bezeichnung } }),
});

stammwertRouten("/kassenarten", "kassenart", "Diese Art existiert bereits.", {
  alle: () => prisma.kassenart.findMany({ orderBy: { bezeichnung: "asc" } }),
  finde: (bezeichnung, ohneId) =>
    prisma.kassenart.findFirst({ where: { bezeichnung, ...(ohneId ? { id: { not: ohneId } } : {}) } }),
  anlegen: (bezeichnung) => prisma.kassenart.create({ data: { bezeichnung } }),
  umbenennen: (id, bezeichnung) => prisma.kassenart.update({ where: { id }, data: { bezeichnung } }),
});

// ============================================================
//  AKTIV-SCHALTER (deaktivieren statt löschen) – für alle Stammdaten gleich
// ============================================================

function aktivRoute(
  pfad: string,
  entitaet: string,
  setzen: (id: number, aktiv: boolean) => Promise<{ id: number; aktiv: boolean }>
) {
  stammdatenRouter.post(`${pfad}/:id/aktiv`, async (req, res) => {
    const id = Number(req.params.id);
    const aktiv = !!req.body?.aktiv;
    const wert = await setzen(id, aktiv);
    await audit({ benutzerId: req.benutzer!.id, aktion: `${entitaet}.${aktiv ? "aktiviert" : "deaktiviert"}`, entitaet, entitaetId: id });
    res.json({ id: wert.id, aktiv: wert.aktiv });
  });
}

aktivRoute("/firmen", "firma", (id, aktiv) => prisma.firma.update({ where: { id }, data: { aktiv } }));
aktivRoute("/kostenstellen", "kostenstelle", (id, aktiv) => prisma.kostenstelle.update({ where: { id }, data: { aktiv } }));
aktivRoute("/konten", "konto", (id, aktiv) => prisma.konto.update({ where: { id }, data: { aktiv } }));
aktivRoute("/steuersaetze", "steuersatz", (id, aktiv) => prisma.steuersatz.update({ where: { id }, data: { aktiv } }));
aktivRoute("/bereiche", "bereich", (id, aktiv) => prisma.bereich.update({ where: { id }, data: { aktiv } }));
aktivRoute("/kassenarten", "kassenart", (id, aktiv) => prisma.kassenart.update({ where: { id }, data: { aktiv } }));
