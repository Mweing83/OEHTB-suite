import { Router } from "express";
import { prisma } from "../lib/db.js";
import { audit } from "../lib/audit.js";
import { angemeldet, rolleErforderlich, darfKostenstelle } from "../middleware/auth.js";

export const abschlussRouter = Router();

// Übersicht der Abschlüsse (gefiltert nach Zugriff). admin/finanzen sehen
// alle Kostenstellen, alle anderen Rollen NUR ihre zugeordneten – auch ohne
// Filter-Parameter (früher lieferte die ungefilterte Liste alle Abschlüsse).
abschlussRouter.get("/", angemeldet, async (req, res) => {
  const roh = req.query.kostenstelle;
  let kostenstelleId: number | undefined;
  if (roh !== undefined && roh !== "") {
    kostenstelleId = Number(roh);
    if (!Number.isInteger(kostenstelleId) || kostenstelleId <= 0) {
      return res.status(400).json({ fehler: "Ungültige Kostenstelle." });
    }
    if (!(await darfKostenstelle(req.benutzer!, kostenstelleId))) {
      return res.status(403).json({ fehler: "Kein Zugriff." });
    }
  }
  const siehtAlle = req.benutzer!.rolle === "admin" || req.benutzer!.rolle === "finanzen";
  const where = kostenstelleId
    ? { kostenstelleId }
    : siehtAlle
      ? {}
      : { kostenstelle: { benutzer: { some: { benutzerId: req.benutzer!.id } } } };
  const abschluesse = await prisma.abschluss.findMany({
    where,
    include: { kostenstelle: { select: { id: true, nummer: true, bezeichnung: true } } },
    orderBy: [{ jahr: "desc" }, { monat: "desc" }],
  });
  res.json(abschluesse);
});

// Statusmaschine des Monatsabschlusses:
//   (kein Abschluss) / offen / eingereicht --einreichen--> eingereicht
//   eingereicht --pruefen--> geprueft
//   geprueft --freigeben--> freigegeben (endgueltig, Periode gesperrt)
// Andere Uebergaenge -> 409. Ein einmal freigegebener Monat (freigegebenAm
// gesetzt) bleibt gesperrt, auch fuer Altdaten mit zurueckgesetztem Status.

// Monatsabschluss einreichen (Erfasser) – mit Soll/Ist-Abgleich
abschlussRouter.post("/einreichen", angemeldet, async (req, res) => {
  const { kostenstelleId, jahr, monat, zaehllisteCent } = req.body ?? {};
  if (!kostenstelleId || !jahr || !monat || zaehllisteCent === undefined) {
    return res.status(400).json({ fehler: "kostenstelleId, jahr, monat, zaehllisteCent erforderlich." });
  }
  if (typeof zaehllisteCent !== "number" || !Number.isFinite(zaehllisteCent)) {
    return res.status(400).json({ fehler: "Gezählter Kassenstand ist keine gültige Zahl." });
  }
  if (
    !Number.isInteger(kostenstelleId) ||
    !Number.isInteger(jahr) ||
    !Number.isInteger(monat) ||
    monat < 1 ||
    monat > 12 ||
    jahr < 2000 ||
    jahr > 2100
  ) {
    return res.status(400).json({ fehler: "Ungültige Kostenstelle, Jahr oder Monat." });
  }
  if (!(await darfKostenstelle(req.benutzer!, kostenstelleId))) {
    return res.status(403).json({ fehler: "Kein Zugriff." });
  }
  const bisher = await prisma.abschluss.findUnique({
    where: { kostenstelleId_jahr_monat: { kostenstelleId, jahr, monat } },
  });
  if (
    bisher &&
    (bisher.freigegebenAm || (bisher.status !== "offen" && bisher.status !== "eingereicht"))
  ) {
    return res.status(409).json({
      fehler: "Abschluss ist bereits geprüft oder freigegeben und kann nicht erneut eingereicht werden.",
    });
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
  if (vorhanden.status !== "eingereicht" || vorhanden.freigegebenAm) {
    return res.status(409).json({ fehler: "Nur eingereichte Abschlüsse können geprüft werden." });
  }
  // Bedingtes Update gegen parallele Statuswechsel.
  const r = await prisma.abschluss.updateMany({
    where: { id, status: "eingereicht" },
    data: { status: "geprueft", geprueftAm: new Date() },
  });
  if (r.count !== 1) {
    return res.status(409).json({ fehler: "Status wurde inzwischen geändert." });
  }
  const a = await prisma.abschluss.findUniqueOrThrow({ where: { id } });
  await audit({ benutzerId: req.benutzer!.id, aktion: "abschluss.geprueft", entitaet: "abschluss", entitaetId: id });
  res.json(a);
});

// Freigeben (Finanzen/Zentrale) -> Periode sperren
abschlussRouter.post("/:id/freigeben", angemeldet, rolleErforderlich("finanzen", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const abschluss = await prisma.abschluss.findUnique({ where: { id } });
  if (!abschluss) return res.status(404).json({ fehler: "Nicht gefunden." });
  if (abschluss.status !== "geprueft" || abschluss.freigegebenAm) {
    return res.status(409).json({ fehler: "Nur geprüfte Abschlüsse können freigegeben werden." });
  }

  const von = new Date(abschluss.jahr, abschluss.monat - 1, 1);
  const bis = new Date(abschluss.jahr, abschluss.monat, 1);

  const freigegeben = await prisma.$transaction(async (tx) => {
    const r = await tx.abschluss.updateMany({
      where: { id, status: "geprueft" },
      data: { status: "freigegeben", freigegebenAm: new Date() },
    });
    if (r.count !== 1) return false;
    // Alle Buchungen der Periode sperren
    await tx.buchung.updateMany({
      where: { kostenstelleId: abschluss.kostenstelleId, belegdatum: { gte: von, lt: bis } },
      data: { gesperrt: true },
    });
    return true;
  });
  if (!freigegeben) {
    return res.status(409).json({ fehler: "Status wurde inzwischen geändert." });
  }

  await audit({ benutzerId: req.benutzer!.id, aktion: "abschluss.freigegeben", entitaet: "abschluss", entitaetId: id });
  res.json({ ok: true });
});
