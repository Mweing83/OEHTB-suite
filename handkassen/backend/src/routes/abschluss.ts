import { Router } from "express";
import { prisma } from "../lib/db.js";
import { audit } from "../lib/audit.js";
import { angemeldet, rolleErforderlich, darfKostenstelle } from "../middleware/auth.js";

export const abschlussRouter = Router();

// Übersicht der Abschlüsse (gefiltert nach Zugriff)
abschlussRouter.get("/", angemeldet, async (req, res) => {
  const kostenstelleId = Number(req.query.kostenstelle);
  if (kostenstelleId && !(await darfKostenstelle(req.benutzer!, kostenstelleId))) {
    return res.status(403).json({ fehler: "Kein Zugriff." });
  }
  const where = kostenstelleId ? { kostenstelleId } : {};
  const abschluesse = await prisma.abschluss.findMany({
    where,
    include: { kostenstelle: true },
    orderBy: [{ jahr: "desc" }, { monat: "desc" }],
  });
  res.json(abschluesse);
});

// Monatsabschluss einreichen (Erfasser) – mit Soll/Ist-Abgleich
abschlussRouter.post("/einreichen", angemeldet, async (req, res) => {
  const { kostenstelleId, jahr, monat, zaehllisteCent } = req.body ?? {};
  if (!kostenstelleId || !jahr || !monat || zaehllisteCent === undefined) {
    return res.status(400).json({ fehler: "kostenstelleId, jahr, monat, zaehllisteCent erforderlich." });
  }
  if (typeof zaehllisteCent !== "number" || !Number.isFinite(zaehllisteCent)) {
    return res.status(400).json({ fehler: "Gezählter Kassenstand ist keine gültige Zahl." });
  }
  if (!(await darfKostenstelle(req.benutzer!, kostenstelleId))) {
    return res.status(403).json({ fehler: "Kein Zugriff." });
  }

  // Soll-Saldo aus den Buchungen des Monats berechnen
  const von = new Date(jahr, monat - 1, 1);
  const bis = new Date(jahr, monat, 1);
  const buchungen = await prisma.buchung.findMany({
    where: { kostenstelleId, storniert: false, belegdatum: { gte: von, lt: bis } },
  });
  const sollCent = buchungen.reduce(
    (s, b) => s + (b.typ === "eingang" ? b.betragCent : -b.betragCent),
    0
  );

  const abschluss = await prisma.abschluss.upsert({
    where: { kostenstelleId_jahr_monat: { kostenstelleId, jahr, monat } },
    update: { zaehllisteCent, status: "eingereicht", eingereichtAm: new Date() },
    create: { kostenstelleId, jahr, monat, zaehllisteCent, status: "eingereicht", eingereichtAm: new Date() },
  });

  await audit({
    benutzerId: req.benutzer!.id,
    aktion: "abschluss.eingereicht",
    entitaet: "abschluss",
    entitaetId: abschluss.id,
    neueWerte: { ...abschluss, sollCent },
  });

  res.json({ ...abschluss, sollCent, differenzCent: zaehllisteCent - sollCent });
});

// Prüfen (Leitung)
abschlussRouter.post("/:id/pruefen", angemeldet, rolleErforderlich("leitung", "finanzen", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const vorhanden = await prisma.abschluss.findUnique({ where: { id } });
  if (!vorhanden) return res.status(404).json({ fehler: "Nicht gefunden." });
  // Leitung darf nur Abschlüsse eigener Kostenstellen prüfen (admin/finanzen sehen alle).
  if (!(await darfKostenstelle(req.benutzer!, vorhanden.kostenstelleId))) {
    return res.status(403).json({ fehler: "Kein Zugriff." });
  }
  const a = await prisma.abschluss.update({
    where: { id },
    data: { status: "geprueft", geprueftAm: new Date() },
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "abschluss.geprueft", entitaet: "abschluss", entitaetId: id });
  res.json(a);
});

// Freigeben (Finanzen/Zentrale) -> Periode sperren
abschlussRouter.post("/:id/freigeben", angemeldet, rolleErforderlich("finanzen", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const abschluss = await prisma.abschluss.findUnique({ where: { id } });
  if (!abschluss) return res.status(404).json({ fehler: "Nicht gefunden." });

  const von = new Date(abschluss.jahr, abschluss.monat - 1, 1);
  const bis = new Date(abschluss.jahr, abschluss.monat, 1);

  await prisma.$transaction(async (tx) => {
    await tx.abschluss.update({
      where: { id },
      data: { status: "freigegeben", freigegebenAm: new Date() },
    });
    // Alle Buchungen der Periode sperren
    await tx.buchung.updateMany({
      where: { kostenstelleId: abschluss.kostenstelleId, belegdatum: { gte: von, lt: bis } },
      data: { gesperrt: true },
    });
  });

  await audit({ benutzerId: req.benutzer!.id, aktion: "abschluss.freigegeben", entitaet: "abschluss", entitaetId: id });
  res.json({ ok: true });
});
