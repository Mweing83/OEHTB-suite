import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { audit } from "../lib/audit.js";
import { angemeldet, rolleErforderlich } from "../middleware/auth.js";
import { sperrFristTage, autoGesperrt } from "../lib/sperre.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// Ablageort der lokalen Sicherungen: DB-Eintrag hat Vorrang, dann Umgebungsvariable,
// dann Entwicklungs-Fallback.
const BACKUP_PFAD_ENV = process.env.BACKUP_LOKAL_PFAD || path.resolve(process.cwd(), "..", "backups");
async function backupPfadHolen(): Promise<string> {
  const k = await prisma.backupKonfig.findFirst({ orderBy: { id: "asc" }, select: { pfadLokal: true } });
  return k?.pfadLokal || BACKUP_PFAD_ENV;
}
const BACKUP_UNTERORDNER = ["taeglich", "monatlich", "jaehrlich"] as const;
const BACKUP_DATEI_REGEX = /^handkassen_\d{8}_\d{6}\.tar\.gz$/;

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
//  KOSTENSTELLEN
// ============================================================

adminRouter.get("/kostenstellen", async (_req, res) => {
  const ks = await prisma.kostenstelle.findMany({
    include: { bereich: true, kassenart: true },
    orderBy: { bezeichnung: "asc" },
  });
  res.json(ks);
});

const ksSchema = z.object({
  nummer: z.string().min(1),
  bezeichnung: z.string().min(1),
  gegenkonto: z.string().min(1),
  bereichId: z.number().int(),
  kassenartId: z.number().int(),
  anfangssaldoCent: z.number().int().optional(),
  belegStartnummer: z.number().int().positive().optional(),
  belegStartJahr: z.number().int().optional(),
});

adminRouter.post("/kostenstellen", async (req, res) => {
  const parse = ksSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const vorhanden = await prisma.kostenstelle.findUnique({ where: { nummer: parse.data.nummer } });
  if (vorhanden) return res.status(409).json({ fehler: "Diese Kostenstellen-Nummer ist bereits vergeben." });
  const anfang = parse.data.anfangssaldoCent ?? 0;
  const ks = await prisma.kostenstelle.create({
    data: { ...parse.data, anfangssaldoCent: anfang, saldoCent: anfang },
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "kostenstelle.erstellt", entitaet: "kostenstelle", entitaetId: ks.id, neueWerte: ks });
  res.status(201).json(ks);
});

// Bearbeiten inkl. Anfangssaldo. Bei Änderung des Anfangssaldos wird der
// laufende Saldo um die Differenz korrigiert (Startbestand verschiebt sich).
adminRouter.put("/kostenstellen/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nummer, bezeichnung, gegenkonto, bereichId, kassenartId, anfangssaldoCent, belegStartnummer, belegStartJahr } = req.body ?? {};
  const alt = await prisma.kostenstelle.findUnique({ where: { id } });
  if (!alt) return res.status(404).json({ fehler: "Nicht gefunden." });

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
      nummer: typeof nummer === "string" && nummer ? nummer : alt.nummer,
      bezeichnung: bezeichnung ?? alt.bezeichnung,
      gegenkonto: typeof gegenkonto === "string" && gegenkonto.trim() ? gegenkonto.trim() : alt.gegenkonto,
      bereichId: typeof bereichId === "number" ? bereichId : alt.bereichId,
      kassenartId: typeof kassenartId === "number" ? kassenartId : alt.kassenartId,
      anfangssaldoCent: neuerAnfang,
      saldoCent: { increment: differenz },
      belegStartnummer:
        belegStartnummer === undefined ? alt.belegStartnummer
        : (belegStartnummer === null || belegStartnummer === "" ? null : Number(belegStartnummer)),
      belegStartJahr:
        belegStartJahr === undefined ? alt.belegStartJahr
        : (belegStartJahr === null || belegStartJahr === "" ? null : Number(belegStartJahr)),
    },
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "kostenstelle.bearbeitet", entitaet: "kostenstelle", entitaetId: id, alteWerte: alt, neueWerte: ks });
  res.json(ks);
});

adminRouter.post("/kostenstellen/:id/aktiv", async (req, res) => {
  const id = Number(req.params.id);
  const { aktiv } = req.body ?? {};
  const ks = await prisma.kostenstelle.update({ where: { id }, data: { aktiv: !!aktiv } });
  await audit({ benutzerId: req.benutzer!.id, aktion: aktiv ? "kostenstelle.aktiviert" : "kostenstelle.deaktiviert", entitaet: "kostenstelle", entitaetId: id });
  res.json({ id: ks.id, aktiv: ks.aktiv });
});

// ============================================================
//  KONTEN (Kontenplan)
// ============================================================

adminRouter.get("/konten", async (_req, res) => {
  const konten = await prisma.konto.findMany({
    orderBy: { nummer: "asc" },
    include: { bereiche: { select: { bereichId: true } } },
  });
  res.json(
    konten.map(({ bereiche, ...k }) => ({ ...k, bereichIds: bereiche.map((b) => b.bereichId) }))
  );
});

const kontoSchema = z.object({
  nummer: z.string().min(1),
  bezeichnung: z.string().min(1),
  beschreibung: z.string().optional(),
  anmerkung: z.string().optional(),
  bereichIds: z.array(z.number().int()).optional(),
});

adminRouter.post("/konten", async (req, res) => {
  const parse = kontoSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const { bereichIds, ...kontoDaten } = parse.data;
  const vorhanden = await prisma.konto.findUnique({ where: { nummer: kontoDaten.nummer } });
  if (vorhanden) return res.status(409).json({ fehler: "Kontonummer bereits vorhanden." });

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
  res.status(201).json({ ...konto, bereichIds: bereichIds ?? [] });
});

adminRouter.put("/konten/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { bezeichnung, beschreibung, anmerkung, bereichIds } = req.body ?? {};
  const konto = await prisma.$transaction(async (tx) => {
    const k = await tx.konto.update({
      where: { id },
      data: { bezeichnung, beschreibung, anmerkung },
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
  res.json({ ...konto, bereichIds: Array.isArray(bereichIds) ? bereichIds : undefined });
});

adminRouter.post("/konten/:id/aktiv", async (req, res) => {
  const id = Number(req.params.id);
  const { aktiv } = req.body ?? {};
  const konto = await prisma.konto.update({ where: { id }, data: { aktiv: !!aktiv } });
  await audit({ benutzerId: req.benutzer!.id, aktion: aktiv ? "konto.aktiviert" : "konto.deaktiviert", entitaet: "konto", entitaetId: id });
  res.json({ id: konto.id, aktiv: konto.aktiv });
});

// ============================================================
//  STEUERSÄTZE
// ============================================================

adminRouter.get("/steuersaetze", async (_req, res) => {
  const saetze = await prisma.steuersatz.findMany({ orderBy: { prozent: "asc" } });
  res.json(saetze.map((s) => ({ ...s, prozent: s.prozent.toNumber() })));
});

const steuerSchema = z.object({
  prozent: z.number().min(0).max(100),
  bezeichnung: z.string().min(1),
});

adminRouter.post("/steuersaetze", async (req, res) => {
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

adminRouter.post("/steuersaetze/:id/aktiv", async (req, res) => {
  const id = Number(req.params.id);
  const { aktiv } = req.body ?? {};
  const satz = await prisma.steuersatz.update({ where: { id }, data: { aktiv: !!aktiv } });
  await audit({ benutzerId: req.benutzer!.id, aktion: aktiv ? "steuersatz.aktiviert" : "steuersatz.deaktiviert", entitaet: "steuersatz", entitaetId: id });
  res.json({ id: satz.id, aktiv: satz.aktiv });
});

// Steuersatz endgueltig loeschen. Bereits gebuchte Positionen speichern den
// Satz als Zahlwert (keine Fremdschluessel-Beziehung), bleiben also unberuehrt.
adminRouter.post("/steuersaetze/:id/loeschen", async (req, res) => {
  const id = Number(req.params.id);
  const satz = await prisma.steuersatz.findUnique({ where: { id } });
  if (!satz) return res.status(404).json({ fehler: "Steuersatz nicht gefunden." });
  await prisma.steuersatz.delete({ where: { id } });
  await audit({ benutzerId: req.benutzer!.id, aktion: "steuersatz.geloescht", entitaet: "steuersatz", entitaetId: id, alteWerte: satz });
  res.json({ ok: true });
});

// ============================================================
//  BEREICHE (Stammdaten für Kostenstellen)
// ============================================================

adminRouter.get("/bereiche", async (_req, res) => {
  const bereiche = await prisma.bereich.findMany({ orderBy: { bezeichnung: "asc" } });
  res.json(bereiche);
});

const bereichSchema = z.object({ bezeichnung: z.string().min(1) });

adminRouter.post("/bereiche", async (req, res) => {
  const parse = bereichSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const vorhanden = await prisma.bereich.findUnique({ where: { bezeichnung: parse.data.bezeichnung } });
  if (vorhanden) return res.status(409).json({ fehler: "Dieser Bereich existiert bereits." });
  const bereich = await prisma.bereich.create({ data: parse.data });
  await audit({ benutzerId: req.benutzer!.id, aktion: "bereich.erstellt", entitaet: "bereich", entitaetId: bereich.id, neueWerte: bereich });
  res.status(201).json(bereich);
});

adminRouter.put("/bereiche/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parse = bereichSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  // Eindeutigkeit: keine zweite Zeile mit gleicher Bezeichnung
  const kollision = await prisma.bereich.findFirst({
    where: { bezeichnung: parse.data.bezeichnung, id: { not: id } },
  });
  if (kollision) return res.status(409).json({ fehler: "Dieser Bereich existiert bereits." });
  const bereich = await prisma.bereich.update({ where: { id }, data: { bezeichnung: parse.data.bezeichnung } });
  await audit({ benutzerId: req.benutzer!.id, aktion: "bereich.bearbeitet", entitaet: "bereich", entitaetId: id, neueWerte: bereich });
  res.json(bereich);
});

adminRouter.post("/bereiche/:id/aktiv", async (req, res) => {
  const id = Number(req.params.id);
  const { aktiv } = req.body ?? {};
  const bereich = await prisma.bereich.update({ where: { id }, data: { aktiv: !!aktiv } });
  await audit({ benutzerId: req.benutzer!.id, aktion: aktiv ? "bereich.aktiviert" : "bereich.deaktiviert", entitaet: "bereich", entitaetId: id });
  res.json({ id: bereich.id, aktiv: bereich.aktiv });
});

// ============================================================
//  KASSENARTEN (Stammdaten für Kostenstellen)
// ============================================================

adminRouter.get("/kassenarten", async (_req, res) => {
  const arten = await prisma.kassenart.findMany({ orderBy: { bezeichnung: "asc" } });
  res.json(arten);
});

const kassenartSchema = z.object({ bezeichnung: z.string().min(1) });

adminRouter.post("/kassenarten", async (req, res) => {
  const parse = kassenartSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const vorhanden = await prisma.kassenart.findUnique({ where: { bezeichnung: parse.data.bezeichnung } });
  if (vorhanden) return res.status(409).json({ fehler: "Diese Art existiert bereits." });
  const art = await prisma.kassenart.create({ data: parse.data });
  await audit({ benutzerId: req.benutzer!.id, aktion: "kassenart.erstellt", entitaet: "kassenart", entitaetId: art.id, neueWerte: art });
  res.status(201).json(art);
});

adminRouter.put("/kassenarten/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parse = kassenartSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const kollision = await prisma.kassenart.findFirst({
    where: { bezeichnung: parse.data.bezeichnung, id: { not: id } },
  });
  if (kollision) return res.status(409).json({ fehler: "Diese Art existiert bereits." });
  const art = await prisma.kassenart.update({ where: { id }, data: { bezeichnung: parse.data.bezeichnung } });
  await audit({ benutzerId: req.benutzer!.id, aktion: "kassenart.bearbeitet", entitaet: "kassenart", entitaetId: id, neueWerte: art });
  res.json(art);
});

adminRouter.post("/kassenarten/:id/aktiv", async (req, res) => {
  const id = Number(req.params.id);
  const { aktiv } = req.body ?? {};
  const art = await prisma.kassenart.update({ where: { id }, data: { aktiv: !!aktiv } });
  await audit({ benutzerId: req.benutzer!.id, aktion: aktiv ? "kassenart.aktiviert" : "kassenart.deaktiviert", entitaet: "kassenart", entitaetId: id });
  res.json({ id: art.id, aktiv: art.aktiv });
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
//  DATENSICHERUNG (Backup)
// ============================================================

// Liefert die einzige Konfigzeile; legt sie an, falls noch nicht vorhanden.
async function backupKonfigHolen() {
  const vorhanden = await prisma.backupKonfig.findFirst({ orderBy: { id: "asc" } });
  if (vorhanden) return vorhanden;
  return prisma.backupKonfig.create({ data: {} });
}

adminRouter.get("/backup", async (_req, res) => {
  const k = await backupKonfigHolen();
  res.json(k);
});

const backupSchema = z.object({
  uhrzeit: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Uhrzeit im Format HH:MM"),
  aufbewahrungTaeglich: z.number().int().min(1).max(3650),
  aufbewahrungMonatlich: z.number().int().min(0).max(120),
  zielNasAktiv: z.boolean(),
  zielUsbAktiv: z.boolean(),
  // Optionaler Lese-Pfad für die App (Anzeige/Prüfung lokaler Sicherungen).
  // null = zurück auf den Server-Standard (.env). NAS/USB-Ablageorte werden
  // NICHT hier gepflegt – sie sind feste Docker-Mounts aus der .env.
  pfadLokal: z.string().nullable().optional(),
});

adminRouter.put("/backup", async (req, res) => {
  const parse = backupSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const k = await backupKonfigHolen();
  const aktualisiert = await prisma.backupKonfig.update({
    where: { id: k.id },
    data: parse.data,
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "backup.einstellungen_geaendert", entitaet: "backup_konfig", entitaetId: k.id, alteWerte: k, neueWerte: aktualisiert });
  res.json(aktualisiert);
});

// "Jetzt sichern": setzt nur das Anforderungs-Flag. Der Backup-Dienst führt
// die Sicherung beim nächsten Durchlauf (wenige Sekunden) aus.
adminRouter.post("/backup/jetzt", async (req, res) => {
  const k = await backupKonfigHolen();
  await prisma.backupKonfig.update({ where: { id: k.id }, data: { laufAngefordert: true } });
  await audit({ benutzerId: req.benutzer!.id, aktion: "backup.manuell_angefordert", entitaet: "backup_konfig", entitaetId: k.id });
  res.json({ ok: true });
});

// Übersicht der lokal vorhandenen Sicherungen (taeglich/monatlich/jaehrlich).
adminRouter.get("/backup/dateien", async (_req, res) => {
  const pfad = await backupPfadHolen();
  const dateien: { ordner: string; name: string; groesseBytes: number; erstelltAm: string }[] = [];
  let gefunden = false;
  for (const ordner of BACKUP_UNTERORDNER) {
    const verz = path.join(pfad, ordner);
    let eintraege: string[];
    try {
      eintraege = await fs.readdir(verz);
      gefunden = true;
    } catch {
      continue; // Ordner (noch) nicht vorhanden
    }
    for (const name of eintraege) {
      if (!BACKUP_DATEI_REGEX.test(name)) continue;
      try {
        const st = await fs.stat(path.join(verz, name));
        dateien.push({ ordner, name, groesseBytes: st.size, erstelltAm: st.mtime.toISOString() });
      } catch {
        /* einzelne Datei ignorieren */
      }
    }
  }
  dateien.sort((a, b) => b.erstelltAm.localeCompare(a.erstelltAm));
  res.json({ pfad, gefunden, dateien });
});

const pruefSchema = z.object({
  ordner: z.enum(["taeglich", "monatlich", "jaehrlich"]),
  name: z.string().regex(BACKUP_DATEI_REGEX, "Ungültiger Dateiname."),
});

// Prüft ein Sicherungsarchiv: Ist es lesbar und enthält es die erwarteten
// Bestandteile? (Listet den Inhalt mit tar, ohne zu entpacken.)
adminRouter.post("/backup/pruefen", async (req, res) => {
  const parse = pruefSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const { ordner, name } = parse.data;

  // Pfad sicher zusammensetzen und sicherstellen, dass er im Backup-Ordner bleibt.
  const pfad = await backupPfadHolen();
  const datei = path.resolve(pfad, ordner, name);
  const basis = path.resolve(pfad, ordner) + path.sep;
  if (!datei.startsWith(basis)) return res.status(400).json({ fehler: "Ungültiger Pfad." });

  try {
    await fs.access(datei);
  } catch {
    return res.status(404).json({ fehler: "Datei nicht gefunden." });
  }

  try {
    const { stdout } = await execFileP("tar", ["-tzf", datei], { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
    const inhalt = stdout.split("\n").map((z) => z.trim()).filter(Boolean);
    const hatDb = inhalt.some((z) => z.endsWith("datenbank.dump"));
    const hatInfo = inhalt.some((z) => z.endsWith("INFO.txt"));
    const ok = hatDb && hatInfo;
    await audit({ benutzerId: req.benutzer!.id, aktion: "backup.geprueft", entitaet: "backup_konfig", entitaetId: 0, neueWerte: { ordner, name, ok } });
    res.json({
      ok,
      meldung: ok
        ? "Archiv ist lesbar und enthält die erwarteten Inhalte (Datenbank + Info)."
        : "Archiv ist lesbar, aber erwartete Inhalte fehlen (datenbank.dump / INFO.txt).",
      inhalt,
    });
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      return res.json({ ok: false, meldung: "Prüfung nicht möglich: 'tar' ist auf dem Server nicht verfügbar." });
    }
    res.json({ ok: false, meldung: "Archiv konnte nicht gelesen werden – möglicherweise beschädigt." });
  }
});

// ============================================================
//  VERZEICHNIS-BROWSER (für Pfad-Auswahl im Admin-Bereich)
// ============================================================

adminRouter.get("/verzeichnis", async (req, res) => {
  const angefragt = typeof req.query.pfad === "string" ? req.query.pfad.trim() : "";

  // Auf Windows ohne Pfad: alle verfügbaren Laufwerke zurückgeben
  if (!angefragt && process.platform === "win32") {
    const buchstaben = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const ergebnisse = await Promise.allSettled(
      buchstaben.map((b) => fs.access(`${b}:\\`).then(() => `${b}:\\`))
    );
    const laufwerke = ergebnisse
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);
    return res.json({ pfad: "", ordner: laufwerke, elternpfad: null });
  }

  const ziel = angefragt || "/";
  try {
    const eintraege = await fs.readdir(ziel, { withFileTypes: true });
    const ordner = eintraege
      .filter((e) => { try { return e.isDirectory(); } catch { return false; } })
      .map((e) => e.name)
      .filter((n) => !n.startsWith("."))
      .sort((a, b) => a.localeCompare(b));

    const eltern = path.dirname(ziel);
    // path.dirname("C:\\") === "C:\\" auf Windows – dann zurück zur Laufwerksliste
    const elternpfad = eltern !== ziel ? eltern : (process.platform === "win32" ? "" : null);

    res.json({ pfad: ziel, ordner, elternpfad });
  } catch (e) {
    res.status(400).json({ fehler: `Verzeichnis nicht lesbar: ${(e as Error).message}` });
  }
});

// ============================================================
//  ALLGEMEIN (Einstellungen) + MONATSSPERRE
// ============================================================

// Liefert die einzige Allgemein-Konfigzeile; legt sie an, falls nicht vorhanden.
async function allgemeinKonfigHolen() {
  const vorhanden = await prisma.allgemeinKonfig.findFirst({ orderBy: { id: "asc" } });
  if (vorhanden) return vorhanden;
  return prisma.allgemeinKonfig.create({ data: {} });
}

adminRouter.get("/allgemein", async (_req, res) => {
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

adminRouter.put("/allgemein", async (req, res) => {
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
adminRouter.get("/sperren", async (req, res) => {
  const kostenstelleId = Number(req.query.kostenstelle);
  const jahr = Number(req.query.jahr);
  if (!kostenstelleId || !jahr) {
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
adminRouter.put("/sperren", async (req, res) => {
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
