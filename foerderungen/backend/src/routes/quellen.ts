import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auditLog } from "../lib/audit";
import { AuthRequest, authPflicht } from "../middleware/auth";

// Foerderquellen: die stabile Foerderlandschaft. Scanner-Vorschlaege sind
// Zeilen im Status VORGESCHLAGEN; Freigeben/Ablehnen ist ein Statuswechsel
// (AKTIV bzw. ARCHIVIERT als Tombstone) via PATCH.
export const quellenRouter = Router();
quellenRouter.use(authPflicht);

const EBENEN = ["BUND", "LAND", "GEMEINDE", "EU", "PRIVAT"] as const;
const KATEGORIEN = ["PROJEKT", "KERNGESCHAEFT", "BEIDES"] as const;
const STATUS = ["AKTIV", "VORGESCHLAGEN", "ARCHIVIERT"] as const;

const anlegenSchema = z.object({
  name: z.string().min(1).max(300),
  traeger: z.string().min(1).max(300),
  ebene: z.enum(EBENEN),
  kategorie: z.enum(KATEGORIEN),
  themen: z.array(z.string().min(1).max(100)).max(20).optional(),
  beschreibung: z.string().max(5000).optional(),
  // .url() allein liesse auch javascript:/data:-URLs durch - nur http(s) erlauben.
  webseite: z
    .string()
    .url()
    .max(1000)
    .refine((u) => /^https?:\/\//i.test(u), "Nur http/https-Links erlaubt.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  kontakt: z.string().max(500).optional(),
});

const aendernSchema = anlegenSchema.partial().extend({
  status: z.enum(STATUS).optional(),
});

quellenRouter.get("/", async (req: AuthRequest, res: Response) => {
  const { status, ebene, kategorie, thema } = req.query as Record<string, string>;
  const quellen = await prisma.foerderquelle.findMany({
    where: {
      ...(status && STATUS.includes(status as (typeof STATUS)[number]) ? { status: status as (typeof STATUS)[number] } : {}),
      ...(ebene && EBENEN.includes(ebene as (typeof EBENEN)[number]) ? { ebene: ebene as (typeof EBENEN)[number] } : {}),
      ...(kategorie && KATEGORIEN.includes(kategorie as (typeof KATEGORIEN)[number]) ? { kategorie: kategorie as (typeof KATEGORIEN)[number] } : {}),
      ...(thema ? { themen: { has: thema } } : {}),
    },
    orderBy: [{ name: "asc" }],
    include: { _count: { select: { ausschreibungen: true } } },
  });
  res.json(quellen);
});

quellenRouter.get("/:id", async (req: AuthRequest, res: Response) => {
  const quelle = await prisma.foerderquelle.findUnique({
    where: { id: String(req.params.id) },
    include: { ausschreibungen: { orderBy: [{ frist: "asc" }] } },
  });
  if (!quelle) {
    res.status(404).json({ fehler: "Foerderquelle nicht gefunden." });
    return;
  }
  res.json(quelle);
});

quellenRouter.post("/", async (req: AuthRequest, res: Response) => {
  const parse = anlegenSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const quelle = await prisma.foerderquelle.create({
    data: { ...parse.data, themen: parse.data.themen ?? [] },
  });
  await auditLog({
    userId: req.benutzer!.userId,
    aktion: "QUELLE_ANGELEGT",
    details: { quelleId: quelle.id, name: quelle.name },
  });
  res.status(201).json(quelle);
});

quellenRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  const parse = aendernSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const vorhanden = await prisma.foerderquelle.findUnique({ where: { id: String(req.params.id) } });
  if (!vorhanden) {
    res.status(404).json({ fehler: "Foerderquelle nicht gefunden." });
    return;
  }
  const quelle = await prisma.foerderquelle.update({
    where: { id: vorhanden.id },
    data: parse.data,
  });
  await auditLog({
    userId: req.benutzer!.userId,
    aktion: parse.data.status && parse.data.status !== vorhanden.status
      ? `QUELLE_STATUS_${parse.data.status}`
      : "QUELLE_GEAENDERT",
    details: { quelleId: quelle.id, name: quelle.name },
  });
  res.json(quelle);
});
