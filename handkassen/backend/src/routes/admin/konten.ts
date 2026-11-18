import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { audit } from "../../lib/audit.js";
import { firmaVorhanden } from "./stammdaten.js";

// Teil der Admin-Routen. Anmeldung und Admin-Rolle prüft routes/admin.ts,
// bevor dieser Router eingehängt wird – nicht eigenständig einhängen.
export const kontenRouter = Router();

// ============================================================
//  KONTEN (Kontenplan)
// ============================================================

kontenRouter.get("/konten", async (req, res) => {
  // Optional nach Firma filtern (Kontenplan je Firma).
  const firmaId = Number(req.query.firma);
  const konten = await prisma.konto.findMany({
    where: Number.isInteger(firmaId) && firmaId > 0 ? { firmaId } : undefined,
    orderBy: [{ firmaId: "asc" }, { nummer: "asc" }],
    include: { bereiche: { select: { bereichId: true } } },
  });
  res.json(
    konten.map(({ bereiche, ...k }) => ({
      ...kontoFuerAusgabe(k),
      bereichIds: bereiche.map((b) => b.bereichId),
    }))
  );
});

// Decimal -> number (sonst kaeme der fixe Steuersatz als String im JSON an).
function kontoFuerAusgabe<T extends { fixSteuersatz: unknown }>(k: T) {
  return { ...k, fixSteuersatz: k.fixSteuersatz == null ? null : Number(k.fixSteuersatz) };
}

// Fixer Steuersatz: null = frei waehlbar, sonst 0–100 mit max. einer Nachkommastelle.
const fixSteuersatzSchema = z
  .number()
  .min(0)
  .max(100)
  .transform((v) => Math.round(v * 10) / 10)
  .nullable();

const kontoSchema = z.object({
  firmaId: z.number().int().positive(),
  nummer: z.string().min(1),
  bezeichnung: z.string().min(1),
  beschreibung: z.string().optional(),
  anmerkung: z.string().optional(),
  bereichIds: z.array(z.number().int()).optional(),
  fixSteuersatz: fixSteuersatzSchema.optional(),
});

kontenRouter.post("/konten", async (req, res) => {
  const parse = kontoSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const { bereichIds, ...kontoDaten } = parse.data;
  if (!(await firmaVorhanden(kontoDaten.firmaId))) return res.status(400).json({ fehler: "Unbekannte Firma." });
  const vorhanden = await prisma.konto.findUnique({
    where: { firmaId_nummer: { firmaId: kontoDaten.firmaId, nummer: kontoDaten.nummer } },
  });
  if (vorhanden) return res.status(409).json({ fehler: "Kontonummer in dieser Firma bereits vorhanden." });

  const konto = await prisma.$transaction(async (tx) => {
    const k = await tx.konto.create({ data: kontoDaten });
    if (bereichIds?.length) {
      await tx.bereichKonto.createMany({
        data: bereichIds.map((bereichId) => ({ bereichId, kontoId: k.id })),
      });
    }
    return k;
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "konto.erstellt", entitaet: "konto", entitaetId: konto.id, neueWerte: { ...konto, bereichIds: bereichIds ?? [] } });
  res.status(201).json({ ...kontoFuerAusgabe(konto), bereichIds: bereichIds ?? [] });
});

kontenRouter.put("/konten/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { bezeichnung, beschreibung, anmerkung, bereichIds } = req.body ?? {};
  // fixSteuersatz nur aendern, wenn mitgeschickt (null = Fixierung aufheben).
  let fixSteuersatz: number | null | undefined;
  if (req.body && "fixSteuersatz" in req.body) {
    const fix = fixSteuersatzSchema.safeParse(req.body.fixSteuersatz);
    if (!fix.success) return res.status(400).json({ fehler: "Ungültiger fixer Steuersatz." });
    fixSteuersatz = fix.data;
  }
  // Firmenwechsel (nur Admin): auch für bebuchte Konten, außer es hängen
  // Buchungen eines freigegebenen Monats daran; ohne Nummernkollision.
  let firmaId: number | undefined;
  if (req.body && req.body.firmaId !== undefined) {
    const alt = await prisma.konto.findUnique({ where: { id } });
    if (!alt) return res.status(404).json({ fehler: "Nicht gefunden." });
    const neu = Number(req.body.firmaId);
    if (!Number.isInteger(neu) || neu <= 0 || !(await firmaVorhanden(neu))) {
      return res.status(400).json({ fehler: "Unbekannte Firma." });
    }
    if (neu !== alt.firmaId) {
      if ((await prisma.buchungsPosition.count({ where: { kontoId: id, buchung: { gesperrt: true } } })) > 0) {
        return res.status(409).json({
          fehler: "Auf dieses Konto wurde in einem bereits freigegebenen Monat gebucht; die Firma kann nicht mehr geändert werden.",
        });
      }
      const kollision = await prisma.konto.findUnique({ where: { firmaId_nummer: { firmaId: neu, nummer: alt.nummer } } });
      if (kollision) return res.status(409).json({ fehler: "Diese Kontonummer gibt es in der Zielfirma bereits." });
      firmaId = neu;
    }
  }
  const konto = await prisma.$transaction(async (tx) => {
    const k = await tx.konto.update({
      where: { id },
      data: { bezeichnung, beschreibung, anmerkung, fixSteuersatz, firmaId },
    });
    if (Array.isArray(bereichIds)) {
      // Freigabemenge vollstaendig neu setzen.
      await tx.bereichKonto.deleteMany({ where: { kontoId: id } });
      if (bereichIds.length) {
        await tx.bereichKonto.createMany({
          data: bereichIds.map((bereichId: number) => ({ bereichId, kontoId: id })),
        });
      }
    }
    return k;
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "konto.bearbeitet", entitaet: "konto", entitaetId: id, neueWerte: { ...konto, bereichIds } });
  res.json({ ...kontoFuerAusgabe(konto), bereichIds: Array.isArray(bereichIds) ? bereichIds : undefined });
});

// ============================================================
//  STEUERSÄTZE
// ============================================================

kontenRouter.get("/steuersaetze", async (_req, res) => {
  const saetze = await prisma.steuersatz.findMany({ orderBy: { prozent: "asc" } });
  res.json(saetze.map((s) => ({ ...s, prozent: s.prozent.toNumber() })));
});

const steuerSchema = z.object({
  prozent: z.number().min(0).max(100),
  bezeichnung: z.string().min(1),
});

kontenRouter.post("/steuersaetze", async (req, res) => {
  const parse = steuerSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  // Auf genau eine Nachkommastelle runden (Decimal(5,1)).
  const prozent = Math.round(parse.data.prozent * 10) / 10;
  const vorhanden = await prisma.steuersatz.findUnique({ where: { prozent } });
  if (vorhanden) return res.status(409).json({ fehler: "Dieser Satz existiert bereits." });
  const satz = await prisma.steuersatz.create({ data: { prozent, bezeichnung: parse.data.bezeichnung } });
  await audit({ benutzerId: req.benutzer!.id, aktion: "steuersatz.erstellt", entitaet: "steuersatz", entitaetId: satz.id, neueWerte: satz });
  res.status(201).json({ ...satz, prozent: satz.prozent.toNumber() });
});

// Steuersatz endgueltig loeschen. Bereits gebuchte Positionen speichern den
// Satz als Zahlwert (keine Fremdschluessel-Beziehung), bleiben also unberuehrt.
kontenRouter.post("/steuersaetze/:id/loeschen", async (req, res) => {
  const id = Number(req.params.id);
  const satz = await prisma.steuersatz.findUnique({ where: { id } });
  if (!satz) return res.status(404).json({ fehler: "Steuersatz nicht gefunden." });
  await prisma.steuersatz.delete({ where: { id } });
  await audit({ benutzerId: req.benutzer!.id, aktion: "steuersatz.geloescht", entitaet: "steuersatz", entitaetId: id, alteWerte: satz });
  res.json({ ok: true });
});
