import { Router } from "express";
import { prisma } from "../lib/db.js";
import { audit } from "../lib/audit.js";
import { angemeldet, rolleErforderlich } from "../middleware/auth.js";
import { stammdatenRouter } from "./admin/stammdaten.js";
import { kontenRouter } from "./admin/konten.js";
import { backupRouter } from "./admin/backup.js";
import { einstellungenRouter } from "./admin/einstellungen.js";

export const adminRouter = Router();

// Alle Endpunkte hier erfordern Anmeldung + Admin-Rolle.
adminRouter.use(angemeldet, rolleErforderlich("admin"));

// ============================================================
//  BENUTZER
// ============================================================

adminRouter.get("/benutzer", async (_req, res) => {
  const benutzer = await prisma.benutzer.findMany({
    select: {
      id: true,
      benutzername: true,
      name: true,
      rolle: true,
      aktiv: true,
      passwortSetzen: true,
      kostenstellen: { select: { kostenstelleId: true } },
    },
    orderBy: { benutzername: "asc" },
  });
  res.json(benutzer);
});

// Hinweis: Benutzer anlegen/bearbeiten, Rolle, Aktiv-Status und Passwort werden
// seit der Suite-Integration zentral im Suite-Portal (Verwaltung) gepflegt.
// Hier verbleibt bewusst NUR die Liste (oben) und die Kostenstellen-Zuordnung
// (unten) – die kostenstellenbezogene Freischaltung ist Handkassen-spezifisch.

// Kostenstellen-Zuweisung eines Benutzers komplett setzen
adminRouter.put("/benutzer/:id/kostenstellen", async (req, res) => {
  const id = Number(req.params.id);
  const ids: number[] = Array.isArray(req.body?.kostenstellenIds) ? req.body.kostenstellenIds : [];

  await prisma.$transaction(async (tx) => {
    await tx.benutzerKostenstelle.deleteMany({ where: { benutzerId: id } });
    if (ids.length) {
      await tx.benutzerKostenstelle.createMany({
        data: ids.map((kostenstelleId) => ({ benutzerId: id, kostenstelleId })),
      });
    }
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "benutzer.kostenstellen_gesetzt", entitaet: "benutzer", entitaetId: id, neueWerte: { kostenstellenIds: ids } });
  res.json({ ok: true });
});

// ============================================================
//  AUDIT-LOG
// ============================================================

adminRouter.get("/audit", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const eintraege = await prisma.auditLog.findMany({
    take: limit,
    orderBy: { zeitpunkt: "desc" },
    include: { benutzer: { select: { name: true, benutzername: true } } },
  });
  res.json(eintraege);
});

// ============================================================
//  Weitere Bereiche (je Thema eine Datei unter routes/admin/)
// ============================================================

adminRouter.use(stammdatenRouter); // Firmen, Kostenstellen, Bereiche, Kassenarten, Aktiv-Schalter
adminRouter.use(kontenRouter); // Kontenplan, Steuersätze
adminRouter.use(backupRouter); // Datensicherung, Verzeichnis-Browser
adminRouter.use(einstellungenRouter); // Allgemein, Monatssperren
