import { Router } from "express";
import { prisma } from "../lib/db.js";
import { angemeldet, darfKostenstelle } from "../middleware/auth.js";
import { belegPflichtAktiv } from "../lib/einstellungen.js";

export const stammdatenRouter = Router();

// --- Einstellungen, die das Buchungsformular braucht (für alle Angemeldeten) ---
stammdatenRouter.get("/einstellungen", angemeldet, async (_req, res) => {
  res.json({ belegPflicht: await belegPflichtAktiv() });
});

// --- Kontaktdaten des Administrators (für alle Angemeldeten sichtbar) ---
stammdatenRouter.get("/kontakt", angemeldet, async (_req, res) => {
  const k = await prisma.allgemeinKonfig.findFirst({ orderBy: { id: "asc" } });
  res.json({
    name: k?.kontaktName ?? "",
    email: k?.kontaktEmail ?? "",
    telefon: k?.kontaktTelefon ?? "",
    hinweis: k?.kontaktHinweis ?? "",
  });
});

// --- Kontenplan der gewaehlten Kostenstelle (nur deren Bereich freigegebene Konten) ---
stammdatenRouter.get("/konten", angemeldet, async (req, res) => {
  const kostenstelleId = Number(req.query.kostenstelle);
  if (!kostenstelleId) return res.status(400).json({ fehler: "kostenstelle erforderlich." });
  if (!(await darfKostenstelle(req.benutzer!, kostenstelleId))) {
    return res.status(403).json({ fehler: "Kein Zugriff auf diese Kostenstelle." });
  }
  const ks = await prisma.kostenstelle.findUnique({
    where: { id: kostenstelleId },
    select: { bereichId: true },
  });
  if (!ks) return res.status(404).json({ fehler: "Kostenstelle nicht gefunden." });

  const konten = await prisma.konto.findMany({
    where: { aktiv: true, bereiche: { some: { bereichId: ks.bereichId } } },
    orderBy: { nummer: "asc" },
  });
  res.json(konten);
});

// --- Aktive Steuersätze (für die Buchungsmaske) ---
stammdatenRouter.get("/steuersaetze", angemeldet, async (_req, res) => {
  const saetze = await prisma.steuersatz.findMany({
    where: { aktiv: true },
    orderBy: { prozent: "asc" },
  });
  res.json(saetze);
});

// --- Aktive Bereiche / Kassenarten (für die Kostenstellen-Maske) ---
stammdatenRouter.get("/bereiche", angemeldet, async (_req, res) => {
  const bereiche = await prisma.bereich.findMany({
    where: { aktiv: true },
    orderBy: { bezeichnung: "asc" },
  });
  res.json(bereiche);
});

stammdatenRouter.get("/kassenarten", angemeldet, async (_req, res) => {
  const arten = await prisma.kassenart.findMany({
    where: { aktiv: true },
    orderBy: { bezeichnung: "asc" },
  });
  res.json(arten);
});

// --- Kostenstellen ---
// Nutzer sehen nur die ihnen zugewiesenen; admin/finanzen sehen alle.
stammdatenRouter.get("/kostenstellen", angemeldet, async (req, res) => {
  const b = req.benutzer!;
  // Nur AKTIVE Kostenstellen fuer die operative Auswahl (Buchen/Berichte/
  // Abschluss). Deaktivierte werden ausschliesslich in der Verwaltung
  // (/admin/kostenstellen) angezeigt und verwaltet.
  if (b.rolle === "admin" || b.rolle === "finanzen") {
    const alle = await prisma.kostenstelle.findMany({
      where: { aktiv: true },
      include: { bereich: true, kassenart: true },
      orderBy: { nummer: "asc" },
    });
    return res.json(alle);
  }
  const eigene = await prisma.kostenstelle.findMany({
    where: { aktiv: true, benutzer: { some: { benutzerId: b.id } } },
    include: { bereich: true, kassenart: true },
    orderBy: { nummer: "asc" },
  });
  res.json(eigene);
});

// Einzelne Kostenstelle (mit Zugriffsprüfung)
stammdatenRouter.get("/kostenstellen/:id", angemeldet, async (req, res) => {
  const id = Number(req.params.id);
  if (!(await darfKostenstelle(req.benutzer!, id))) {
    return res.status(403).json({ fehler: "Kein Zugriff auf diese Kostenstelle." });
  }
  const ks = await prisma.kostenstelle.findUnique({
    where: { id },
    include: { bereich: true, kassenart: true },
  });
  if (!ks) return res.status(404).json({ fehler: "Nicht gefunden." });
  res.json(ks);
});

// Hinweis: Das Anlegen/Bearbeiten von Kostenstellen läuft über /admin/kostenstellen
// (siehe routes/admin.ts). Dort werden bereichId/kassenartId und das Audit-Log
// korrekt behandelt.
