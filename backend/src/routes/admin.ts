import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auditLog } from "../lib/audit";
import { passwortHashen } from "../lib/auth";
import { einrichtungsCodeErzeugen } from "../lib/einrichtungscode";
import {
  provisionUpsert,
  provisionUpsertAlleTools,
  provisionDelete,
} from "../lib/provision";
import {
  angemeldet,
  AuthRequest,
  verwaltungPflicht,
} from "../middleware/auth";

export const adminRouter = Router();

// Alle Verwaltungsrouten: angemeldet UND Verwaltungs-Admin.
adminRouter.use(angemeldet);
adminRouter.use(verwaltungPflicht);

// ---------------------------------------------------------------------------
// GET /api/suite/admin/tools – Registry (fuer Matrix-Spalten und Rollenlisten)
// ---------------------------------------------------------------------------
adminRouter.get("/tools", async (_req: AuthRequest, res: Response) => {
  const tools = await prisma.tool.findMany({
    orderBy: { reihenfolge: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      beschreibung: true,
      pfad: true,
      rollen: true,
      aktiv: true,
    },
  });
  res.json(tools);
});

// ---------------------------------------------------------------------------
// GET /api/suite/admin/benutzer – Liste inkl. Zugriffen
// ---------------------------------------------------------------------------
adminRouter.get("/benutzer", async (_req: AuthRequest, res: Response) => {
  const benutzer = await prisma.suiteUser.findMany({
    orderBy: { benutzername: "asc" },
    select: {
      id: true,
      benutzername: true,
      name: true,
      email: true,
      aktiv: true,
      passwortSetzen: true,
      letzterLogin: true,
      zugriffe: {
        select: { rolle: true, tool: { select: { slug: true } } },
      },
    },
  });
  res.json(
    benutzer.map((b) => ({
      id: b.id,
      benutzername: b.benutzername,
      name: b.name,
      email: b.email,
      aktiv: b.aktiv,
      passwortSetzen: b.passwortSetzen,
      letzterLogin: b.letzterLogin,
      zugriff: Object.fromEntries(
        b.zugriffe.map((z) => [z.tool.slug, z.rolle])
      ),
    }))
  );
});

// ---------------------------------------------------------------------------
// POST /api/suite/admin/benutzer – anlegen (ohne Passwort: Erstlogin-Flow)
// ---------------------------------------------------------------------------
const benutzerSchema = z.object({
  benutzername: z
    .string()
    .min(2)
    .regex(/^[a-z0-9._-]+$/i, "Nur Buchstaben, Ziffern, . _ -"),
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
});

adminRouter.post("/benutzer", async (req: AuthRequest, res: Response) => {
  const parse = benutzerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      fehler: parse.error.issues[0]?.message ?? "Ungültige Eingabe.",
    });
    return;
  }
  const d = parse.data;

  const vorhanden = await prisma.suiteUser.findUnique({
    where: { benutzername: d.benutzername.toLowerCase() },
  });
  if (vorhanden) {
    res.status(409).json({ fehler: "Benutzername bereits vergeben." });
    return;
  }

  // Benutzer setzt sein Passwort beim Erstlogin – mit dem Einrichtungscode,
  // den der Admin hier einmalig angezeigt bekommt und persoenlich uebergibt.
  const code = einrichtungsCodeErzeugen();
  const user = await prisma.suiteUser.create({
    data: {
      benutzername: d.benutzername.toLowerCase(),
      name: d.name,
      email: d.email || null,
      passwortSetzen: true,
      einrichtungsCodeHash: code.hash,
      einrichtungsCodeBis: code.bis,
    },
    select: { id: true, benutzername: true, name: true },
  });

  await auditLog({
    userId: req.benutzer?.sub,
    aktion: "BENUTZER_ANGELEGT",
    details: { neuerBenutzer: user.id },
  });

  res.status(201).json({
    ...user,
    einrichtungsCode: code.klartext,
    einrichtungsCodeBis: code.bis,
  });
});

// ---------------------------------------------------------------------------
// PUT /api/suite/admin/benutzer/:id – Stammdaten/Status/Passwort-Reset
// ---------------------------------------------------------------------------
const benutzerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  aktiv: z.boolean().optional(),
  // true => Passwort zuruecksetzen: Benutzer muss beim naechsten Login neu setzen.
  passwortReset: z.boolean().optional(),
  // Alternativ direkt ein Passwort vergeben (z. B. Ersteinrichtung vor Ort).
  passwort: z.string().min(8).optional(),
});

adminRouter.put("/benutzer/:id", async (req: AuthRequest, res: Response) => {
  const parse = benutzerUpdateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const d = parse.data;

  // Selbst-Deaktivierung verhindern.
  if (d.aktiv === false && req.params.id === req.benutzer?.sub) {
    res.status(409).json({ fehler: "Sie können sich nicht selbst deaktivieren." });
    return;
  }

  const daten: Record<string, unknown> = {};
  if (d.name !== undefined) daten.name = d.name;
  if (d.email !== undefined) daten.email = d.email || null;
  if (d.aktiv !== undefined) daten.aktiv = d.aktiv;
  let code: ReturnType<typeof einrichtungsCodeErzeugen> | null = null;
  if (d.passwortReset) {
    code = einrichtungsCodeErzeugen();
    daten.passwortHash = null;
    daten.passwortSetzen = true;
    daten.einrichtungsCodeHash = code.hash;
    daten.einrichtungsCodeBis = code.bis;
    daten.tokenGeneration = { increment: 1 }; // laufende Sitzungen beenden
  } else if (d.passwort) {
    daten.passwortHash = await passwortHashen(d.passwort);
    daten.passwortSetzen = false;
    daten.einrichtungsCodeHash = null;
    daten.einrichtungsCodeBis = null;
    daten.tokenGeneration = { increment: 1 };
  }

  const user = await prisma.suiteUser.update({
    where: { id: req.params.id },
    data: daten,
    select: { id: true, benutzername: true, name: true, aktiv: true },
  });

  await auditLog({
    userId: req.benutzer?.sub,
    aktion: "BENUTZER_GEAENDERT",
    details: { betroffenerBenutzer: user.id },
  });

  // Stammdaten/Status an alle Tools mit Zugriff verteilen (kein Drift).
  await provisionUpsertAlleTools(user.id);

  res.json(
    code
      ? { ...user, einrichtungsCode: code.klartext, einrichtungsCodeBis: code.bis }
      : user
  );
});

// ---------------------------------------------------------------------------
// POST /api/suite/admin/benutzer/:id/einrichtungscode – neuen Einrichtungscode
// fuer ein Konto ausstellen, das sein Passwort noch setzen muss (Code verloren
// oder abgelaufen). Der alte Code wird dadurch ungueltig.
// ---------------------------------------------------------------------------
adminRouter.post(
  "/benutzer/:id/einrichtungscode",
  async (req: AuthRequest, res: Response) => {
    const ziel = await prisma.suiteUser.findUnique({ where: { id: req.params.id } });
    if (!ziel) {
      res.status(404).json({ fehler: "Benutzer nicht gefunden." });
      return;
    }
    if (!ziel.passwortSetzen) {
      res.status(409).json({
        fehler:
          "Der Benutzer hat bereits ein Passwort. Für einen Neustart „Passwort zurücksetzen“ verwenden.",
      });
      return;
    }
    const code = einrichtungsCodeErzeugen();
    await prisma.suiteUser.update({
      where: { id: ziel.id },
      data: { einrichtungsCodeHash: code.hash, einrichtungsCodeBis: code.bis },
    });
    await auditLog({
      userId: req.benutzer?.sub,
      aktion: "EINRICHTUNGSCODE_AUSGESTELLT",
      details: { betroffenerBenutzer: ziel.id },
    });
    res.json({ einrichtungsCode: code.klartext, einrichtungsCodeBis: code.bis });
  }
);

// ---------------------------------------------------------------------------
// PUT /api/suite/admin/benutzer/:id/zugriff – Zugriffsmatrix einer Person.
// Body: { zugriff: { <toolSlug>: <rolle> | null } } – null entzieht Zutritt.
// ---------------------------------------------------------------------------
const zugriffSchema = z.object({
  zugriff: z.record(z.string(), z.string().nullable()),
});

adminRouter.put(
  "/benutzer/:id/zugriff",
  async (req: AuthRequest, res: Response) => {
    const parse = zugriffSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ fehler: "Ungültige Eingabe." });
      return;
    }
    const userId = req.params.id;

    const user = await prisma.suiteUser.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ fehler: "Benutzer nicht gefunden." });
      return;
    }

    const tools = await prisma.tool.findMany();
    const proSlug = new Map(tools.map((t) => [t.slug, t]));

    for (const [slug, rolle] of Object.entries(parse.data.zugriff)) {
      const tool = proSlug.get(slug);
      if (!tool) {
        res.status(400).json({ fehler: `Unbekanntes Tool: ${slug}` });
        return;
      }
      if (rolle !== null) {
        const erlaubteRollen = tool.rollen as string[];
        if (!erlaubteRollen.includes(rolle)) {
          res.status(400).json({
            fehler: `Ungültige Rolle "${rolle}" für Tool "${slug}".`,
          });
          return;
        }
      }
    }

    // Schutz: der letzte Verwaltungs-Admin darf den Verwaltungs-Zugriff
    // nicht verlieren (sonst sperrt sich die Organisation selbst aus).
    const verwaltung = proSlug.get("verwaltung");
    const entziehtVerwaltung =
      verwaltung &&
      Object.entries(parse.data.zugriff).some(
        ([slug, rolle]) => slug === "verwaltung" && rolle === null
      );
    if (verwaltung && entziehtVerwaltung) {
      const adminAnzahl = await prisma.zugriff.count({
        where: {
          toolId: verwaltung.id,
          rolle: "admin",
          user: { aktiv: true },
        },
      });
      const hatVerwaltung = await prisma.zugriff.findUnique({
        where: { userId_toolId: { userId, toolId: verwaltung.id } },
      });
      if (hatVerwaltung && adminAnzahl <= 1) {
        res.status(409).json({
          fehler:
            "Der letzte Verwaltungs-Administrator kann nicht entfernt werden.",
        });
        return;
      }
    }

    // Aenderungen anwenden.
    for (const [slug, rolle] of Object.entries(parse.data.zugriff)) {
      const tool = proSlug.get(slug)!;
      if (rolle === null) {
        await prisma.zugriff.deleteMany({
          where: { userId, toolId: tool.id },
        });
      } else {
        await prisma.zugriff.upsert({
          where: { userId_toolId: { userId, toolId: tool.id } },
          update: { rolle },
          create: { userId, toolId: tool.id, rolle },
        });
      }
    }

    // Betroffene Tools provisionieren: Grant/Rollenwechsel -> UPSERT mit Rolle,
    // Entzug -> UPSERT mit rolle:null (Tool deaktiviert lokal). Der Payload wird
    // aus dem aktuellen DB-Stand gebaut, spiegelt die Aenderung also korrekt.
    for (const slug of Object.keys(parse.data.zugriff)) {
      await provisionUpsert(userId, slug);
    }

    await auditLog({
      userId: req.benutzer?.sub,
      aktion: "ZUGRIFF_GEAENDERT",
      details: { betroffenerBenutzer: userId, zugriff: parse.data.zugriff },
    });

    const zugriffe = await prisma.zugriff.findMany({
      where: { userId },
      include: { tool: { select: { slug: true } } },
    });
    res.json({
      zugriff: Object.fromEntries(zugriffe.map((z) => [z.tool.slug, z.rolle])),
    });
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/suite/admin/benutzer/:id
// ---------------------------------------------------------------------------
adminRouter.delete(
  "/benutzer/:id",
  async (req: AuthRequest, res: Response) => {
    const zielId = req.params.id;
    if (zielId === req.benutzer?.sub) {
      res.status(409).json({ fehler: "Sie können sich nicht selbst löschen." });
      return;
    }

    const ziel = await prisma.suiteUser.findUnique({
      where: { id: zielId },
      include: { zugriffe: { include: { tool: true } } },
    });
    if (!ziel) {
      res.status(404).json({ fehler: "Benutzer nicht gefunden." });
      return;
    }

    // Letzten aktiven Verwaltungs-Admin schuetzen.
    const istVerwalter = ziel.zugriffe.some(
      (z) => z.tool.slug === "verwaltung" && z.rolle === "admin"
    );
    if (istVerwalter) {
      const verwaltung = await prisma.tool.findUnique({
        where: { slug: "verwaltung" },
      });
      const adminAnzahl = verwaltung
        ? await prisma.zugriff.count({
            where: {
              toolId: verwaltung.id,
              rolle: "admin",
              user: { aktiv: true },
            },
          })
        : 0;
      if (adminAnzahl <= 1) {
        res.status(409).json({
          fehler:
            "Der letzte Verwaltungs-Administrator kann nicht gelöscht werden.",
        });
        return;
      }
    }

    // Vor dem zentralen Loeschen: an ALLE Tools mit Backend einen Tombstone
    // schicken – nicht nur an die aktuell zugewiesenen. So wird der Benutzer
    // ueberall als geloescht markiert, auch wenn der Zugriff vorher schon
    // entzogen wurde. Der Tombstone ist idempotent (Tools ohne diesen Benutzer
    // ignorieren ihn).
    const provisionierbareTools = await prisma.tool.findMany({
      where: { provisionUrl: { not: null } },
    });
    for (const t of provisionierbareTools) {
      await provisionDelete(zielId, t.slug, ziel.benutzername);
    }

    await prisma.suiteUser.delete({ where: { id: zielId } });
    await auditLog({
      userId: req.benutzer?.sub,
      aktion: "BENUTZER_GELOESCHT",
      details: { geloeschterBenutzer: zielId, benutzername: ziel.benutzername },
    });

    res.json({ ok: true });
  }
);

// ---------------------------------------------------------------------------
// GET /api/suite/admin/audit – juengste Eintraege, IDs zu Namen aufgeloest
// ---------------------------------------------------------------------------
adminRouter.get("/audit", async (_req: AuthRequest, res: Response) => {
  const eintraege = await prisma.auditLog.findMany({
    orderBy: { zeitpunkt: "desc" },
    take: 200,
  });

  const userIds = Array.from(
    new Set(eintraege.map((e) => e.userId).filter((x): x is string => !!x))
  );
  const users = await prisma.suiteUser.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, benutzername: true },
  });
  const nameMap = new Map(users.map((u) => [u.id, u.name || u.benutzername]));

  res.json(
    eintraege.map((e) => ({
      id: e.id,
      zeitpunkt: e.zeitpunkt,
      aktion: e.aktion,
      benutzer: e.userId ? nameMap.get(e.userId) ?? "(gelöscht)" : null,
      details: e.details,
    }))
  );
});
