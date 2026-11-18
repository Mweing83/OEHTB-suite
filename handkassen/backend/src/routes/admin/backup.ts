import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { audit } from "../../lib/audit.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Teil der Admin-Routen. Anmeldung und Admin-Rolle prüft routes/admin.ts,
// bevor dieser Router eingehängt wird – nicht eigenständig einhängen.
export const backupRouter = Router();

const execFileP = promisify(execFile);

// Ablageort der lokalen Sicherungen: DB-Eintrag hat Vorrang, dann Umgebungsvariable,
// dann Entwicklungs-Fallback.
const BACKUP_PFAD_ENV = process.env.BACKUP_LOKAL_PFAD || path.resolve(process.cwd(), "..", "backups");
// Wurzel des Sicherungsbereichs: Verzeichnis-Browser und gespeicherter
// Lese-Pfad muessen darin liegen.
const BACKUP_WURZEL = path.resolve(process.env.BACKUP_WURZEL || BACKUP_PFAD_ENV);

async function echteWurzel(): Promise<string> {
  try {
    return await fs.realpath(BACKUP_WURZEL);
  } catch {
    return BACKUP_WURZEL;
  }
}

// Liefert den (symlink-aufgeloesten) Pfad, wenn er innerhalb der Wurzel liegt,
// sonst null. Nicht existierende Pfade gelten als ausserhalb.
async function imBackupBereich(roh: string): Promise<string | null> {
  let echt: string;
  try {
    echt = await fs.realpath(path.resolve(roh));
  } catch {
    return null;
  }
  const wurzel = await echteWurzel();
  return echt === wurzel || echt.startsWith(wurzel + path.sep) ? echt : null;
}

async function backupPfadHolen(): Promise<string> {
  const k = await prisma.backupKonfig.findFirst({ orderBy: { id: "asc" }, select: { pfadLokal: true } });
  // Altbestand ausserhalb des Sicherungsbereichs wird ignoriert.
  if (k?.pfadLokal && (await imBackupBereich(k.pfadLokal))) return k.pfadLokal;
  return BACKUP_PFAD_ENV;
}
const BACKUP_UNTERORDNER = ["taeglich", "monatlich", "jaehrlich"] as const;
const BACKUP_DATEI_REGEX = /^handkassen_\d{8}_\d{6}\.tar\.gz$/;

// ============================================================
//  DATENSICHERUNG (Backup)
// ============================================================

// Liefert die einzige Konfigzeile; legt sie an, falls noch nicht vorhanden.
async function backupKonfigHolen() {
  const vorhanden = await prisma.backupKonfig.findFirst({ orderBy: { id: "asc" } });
  if (vorhanden) return vorhanden;
  return prisma.backupKonfig.create({ data: {} });
}

backupRouter.get("/backup", async (_req, res) => {
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

backupRouter.put("/backup", async (req, res) => {
  const parse = backupSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  // Lese-Pfad nur innerhalb des Sicherungsbereichs (null = Server-Standard).
  if (parse.data.pfadLokal) {
    const geprueft = await imBackupBereich(parse.data.pfadLokal);
    if (!geprueft) {
      return res.status(400).json({ fehler: "Der Pfad muss im Sicherungsbereich des Servers liegen." });
    }
    parse.data.pfadLokal = geprueft;
  }
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
backupRouter.post("/backup/jetzt", async (req, res) => {
  const k = await backupKonfigHolen();
  await prisma.backupKonfig.update({ where: { id: k.id }, data: { laufAngefordert: true } });
  await audit({ benutzerId: req.benutzer!.id, aktion: "backup.manuell_angefordert", entitaet: "backup_konfig", entitaetId: k.id });
  res.json({ ok: true });
});

// Übersicht der lokal vorhandenen Sicherungen (taeglich/monatlich/jaehrlich).
backupRouter.get("/backup/dateien", async (_req, res) => {
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
backupRouter.post("/backup/pruefen", async (req, res) => {
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

// Der Browser ist auf den Backup-Bereich des Servers beschränkt (Security-
// Audit 2026-10: vorher ließ sich das ganze Container-Dateisystem auflisten).
// Ohne Pfad startet er im Backup-Bereich; nach oben geht es nur bis dorthin.
backupRouter.get("/verzeichnis", async (req, res) => {
  const angefragt = typeof req.query.pfad === "string" ? req.query.pfad.trim() : "";
  const ziel = await imBackupBereich(angefragt || BACKUP_WURZEL);
  if (!ziel) {
    return res.status(400).json({ fehler: "Nur Ordner im Sicherungsbereich des Servers sind auswählbar." });
  }
  try {
    const eintraege = await fs.readdir(ziel, { withFileTypes: true });
    const ordner = eintraege
      .filter((e) => { try { return e.isDirectory(); } catch { return false; } })
      .map((e) => e.name)
      .filter((n) => !n.startsWith("."))
      .sort((a, b) => a.localeCompare(b));

    const wurzel = await echteWurzel();
    const elternpfad = ziel === wurzel ? null : path.dirname(ziel);
    res.json({ pfad: ziel, ordner, elternpfad });
  } catch {
    res.status(400).json({ fehler: "Verzeichnis nicht lesbar." });
  }
});
