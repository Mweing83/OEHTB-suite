import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auditLog } from "../lib/audit";
import { AuthRequest, authPflicht } from "../middleware/auth";
import { normalisiereLink } from "../services/scanner";

// Ausschreibungen: der zeitkritische Teil. Scanner-Vorschlaege sind Zeilen im
// Status VORGESCHLAGEN. Sonderfall Aktualisierungsvorschlag (siehe Spec):
// PATCH auf status=OFFEN uebertraegt die Felder auf die Bestandszeile und
// loescht den Vorschlag.
export const ausschreibungenRouter = Router();
ausschreibungenRouter.use(authPflicht);

const STATUS = ["OFFEN", "VORGESCHLAGEN", "ABGELAUFEN", "ABGELEHNT"] as const;

const anlegenSchema = z.object({
  foerderquelleId: z.string().min(1),
  titel: z.string().min(1).max(500),
  beschreibung: z.string().max(5000).optional(),
  // .url() allein liesse auch javascript:/data:-URLs durch - nur http(s) erlauben.
  link: z
    .string()
    .url()
    .max(1000)
    .refine((u) => /^https?:\/\//i.test(u), "Nur http/https-Links erlaubt.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  frist: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  laufendEinreichbar: z.boolean().optional(),
  foerderhoehe: z.string().max(500).optional(),
});

const aendernSchema = anlegenSchema.partial().extend({
  status: z.enum(STATUS).optional(),
  frist: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

function fristAlsDatum(frist: string | null | undefined): Date | null | undefined {
  if (frist === undefined) return undefined;
  return frist === null ? null : new Date(frist + "T00:00:00.000Z");
}

ausschreibungenRouter.get("/", async (req: AuthRequest, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const liste = await prisma.ausschreibung.findMany({
    where: status && STATUS.includes(status as (typeof STATUS)[number])
      ? { status: status as (typeof STATUS)[number] }
      : {},
    orderBy: [{ frist: { sort: "asc", nulls: "last" } }, { titel: "asc" }],
    include: { foerderquelle: true, aktualisiertAusschreibung: true },
  });
  res.json(liste);
});

ausschreibungenRouter.post("/", async (req: AuthRequest, res: Response) => {
  const parse = anlegenSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const quelle = await prisma.foerderquelle.findUnique({
    where: { id: parse.data.foerderquelleId },
  });
  if (!quelle) {
    res.status(400).json({ fehler: "Foerderquelle nicht gefunden." });
    return;
  }
  const a = await prisma.ausschreibung.create({
    data: {
      ...parse.data,
      frist: fristAlsDatum(parse.data.frist),
      linkNormalisiert: parse.data.link ? normalisiereLink(parse.data.link) : null,
    },
    include: { foerderquelle: true },
  });
  await auditLog({
    userId: req.benutzer!.userId,
    aktion: "AUSSCHREIBUNG_ANGELEGT",
    details: { ausschreibungId: a.id, titel: a.titel },
  });
  res.status(201).json(a);
});

ausschreibungenRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  const parse = aendernSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const vorhanden = await prisma.ausschreibung.findUnique({ where: { id: req.params.id } });
  if (!vorhanden) {
    res.status(404).json({ fehler: "Ausschreibung nicht gefunden." });
    return;
  }

  // Sonderfall: Aktualisierungsvorschlag wird uebernommen -> Felder auf die
  // Bestandszeile uebertragen, Vorschlag loeschen, Bestandszeile antworten.
  if (
    parse.data.status === "OFFEN" &&
    vorhanden.status === "VORGESCHLAGEN" &&
    vorhanden.aktualisiertAusschreibungId
  ) {
    const [aktualisiert] = await prisma.$transaction([
      prisma.ausschreibung.update({
        where: { id: vorhanden.aktualisiertAusschreibungId },
        data: {
          titel: vorhanden.titel,
          beschreibung: vorhanden.beschreibung,
          link: vorhanden.link,
          linkNormalisiert: vorhanden.linkNormalisiert,
          frist: vorhanden.frist,
          laufendEinreichbar: vorhanden.laufendEinreichbar,
          foerderhoehe: vorhanden.foerderhoehe,
          status: "OFFEN",
        },
        include: { foerderquelle: true },
      }),
      prisma.ausschreibung.delete({ where: { id: vorhanden.id } }),
    ]);
    await auditLog({
      userId: req.benutzer!.userId,
      aktion: "AUSSCHREIBUNG_AKTUALISIERUNG_UEBERNOMMEN",
      details: { ausschreibungId: aktualisiert.id, titel: aktualisiert.titel },
    });
    res.json(aktualisiert);
    return;
  }

  const daten: Record<string, unknown> = { ...parse.data };
  if ("frist" in parse.data) daten.frist = fristAlsDatum(parse.data.frist);
  if (parse.data.link !== undefined) {
    daten.linkNormalisiert = parse.data.link ? normalisiereLink(parse.data.link) : null;
  }
  const a = await prisma.ausschreibung.update({
    where: { id: vorhanden.id },
    data: daten,
    include: { foerderquelle: true },
  });
  await auditLog({
    userId: req.benutzer!.userId,
    aktion: parse.data.status && parse.data.status !== vorhanden.status
      ? `AUSSCHREIBUNG_STATUS_${parse.data.status}`
      : "AUSSCHREIBUNG_GEAENDERT",
    details: { ausschreibungId: a.id, titel: a.titel },
  });
  res.json(a);
});
