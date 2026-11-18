import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { audit } from "../../lib/audit.js";
import { sperrFristTage, autoGesperrt } from "../../lib/sperre.js";
import { idAusQuery, istJahr } from "../../lib/periode.js";

// Teil der Admin-Routen. Anmeldung und Admin-Rolle prüft routes/admin.ts,
// bevor dieser Router eingehängt wird – nicht eigenständig einhängen.
export const einstellungenRouter = Router();

// ============================================================
//  ALLGEMEIN (Einstellungen) + MONATSSPERRE
// ============================================================

// Liefert die einzige Allgemein-Konfigzeile; legt sie an, falls nicht vorhanden.
async function allgemeinKonfigHolen() {
  const vorhanden = await prisma.allgemeinKonfig.findFirst({ orderBy: { id: "asc" } });
  if (vorhanden) return vorhanden;
  return prisma.allgemeinKonfig.create({ data: {} });
}

einstellungenRouter.get("/allgemein", async (_req, res) => {
  res.json(await allgemeinKonfigHolen());
});

const allgemeinSchema = z.object({
  sperrFristTage: z.number().int().min(0).max(366).optional(),
  belegPflicht: z.boolean().optional(),
  fotoMaxKantePx: z.number().int().min(400).max(4000).optional(),
  fotoQualitaet: z.number().int().min(30).max(100).optional(),
  kontaktName: z.string().max(200).optional(),
  kontaktEmail: z.string().max(200).optional(),
  kontaktTelefon: z.string().max(100).optional(),
  kontaktHinweis: z.string().max(2000).optional(),
});

einstellungenRouter.put("/allgemein", async (req, res) => {
  const parse = allgemeinSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const k = await allgemeinKonfigHolen();
  const aktualisiert = await prisma.allgemeinKonfig.update({
    where: { id: k.id },
    data: parse.data,
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "allgemein.geaendert", entitaet: "allgemein_konfig", entitaetId: k.id, alteWerte: k, neueWerte: aktualisiert });
  res.json(aktualisiert);
});

// Übersicht der Monatssperren einer Kostenstelle für ein Jahr (12 Monate).
// Pro Monat: effektiver Status, ob manuell gesetzt, und der automatische Status.
einstellungenRouter.get("/sperren", async (req, res) => {
  const kostenstelleId = idAusQuery(req.query.kostenstelle);
  const jahr = Number(req.query.jahr);
  if (!kostenstelleId || !istJahr(jahr)) {
    return res.status(400).json({ fehler: "kostenstelle und jahr erforderlich." });
  }
  const frist = await sperrFristTage();
  const explizit = await prisma.monatsSperre.findMany({ where: { kostenstelleId, jahr } });
  const expMap = new Map(explizit.map((e) => [e.monat, e]));

  const monate = [];
  for (let m = 1; m <= 12; m++) {
    const e = expMap.get(m);
    const auto = autoGesperrt(jahr, m, frist);
    monate.push({
      monat: m,
      gesperrt: e ? e.gesperrt : auto,
      manuell: !!e,
      autoGesperrt: auto,
    });
  }
  res.json({ kostenstelleId, jahr, sperrFristTage: frist, monate });
});

const sperreSchema = z.object({
  kostenstelleId: z.number().int(),
  jahr: z.number().int().min(2000).max(2100),
  monat: z.number().int().min(1).max(12),
  modus: z.enum(["sperren", "entsperren", "automatisch"]),
});

// Setzt eine Monatssperre manuell: "sperren"/"entsperren" erzwingen den Zustand,
// "automatisch" entfernt den manuellen Eintrag (zurück zur Frist-Regel).
einstellungenRouter.put("/sperren", async (req, res) => {
  const parse = sperreSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const { kostenstelleId, jahr, monat, modus } = parse.data;

  if (modus === "automatisch") {
    await prisma.monatsSperre.deleteMany({ where: { kostenstelleId, jahr, monat } });
  } else {
    const gesperrt = modus === "sperren";
    await prisma.monatsSperre.upsert({
      where: { kostenstelleId_jahr_monat: { kostenstelleId, jahr, monat } },
      update: { gesperrt, geaendertAm: new Date() },
      create: { kostenstelleId, jahr, monat, gesperrt },
    });
  }
  await audit({ benutzerId: req.benutzer!.id, aktion: "monatssperre.geaendert", entitaet: "monats_sperre", entitaetId: kostenstelleId, neueWerte: { kostenstelleId, jahr, monat, modus } });
  res.json({ ok: true });
});
