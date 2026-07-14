import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { prisma } from "../lib/db.js";
import { audit } from "../lib/audit.js";
import { angemeldet, darfKostenstelle } from "../middleware/auth.js";
import { buchungValidieren, saldoWirkung, belegnummerFormat, type BuchungEingabe } from "../lib/buchungslogik.js";
import { monatGesperrt } from "../lib/sperre.js";
import { belegPflichtAktiv } from "../lib/einstellungen.js";

export const buchungRouter = Router();

// --- Beleg-Upload ins lokale Dateisystem ---
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve("uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Sichere Dateiendung ausschließlich aus dem MIME-Typ ableiten (NICHT aus dem
// vom Client gelieferten Dateinamen). Das verhindert, dass z. B. eine als Bild
// deklarierte Datei mit Endung ".html" gespeichert und später als HTML
// ausgeliefert wird (Stored-XSS).
const ENDUNG_NACH_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

const speicher = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const endung = ENDUNG_NACH_MIME[file.mimetype] ?? "bin";
    const zufall = Math.random().toString(36).slice(2, 8);
    cb(null, `${Date.now()}_${zufall}.${endung}`);
  },
});
const upload = multer({
  storage: speicher,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const erlaubt = ["image/jpeg", "image/png", "application/pdf"];
    cb(null, erlaubt.includes(file.mimetype));
  },
});

// Wrapper um upload.single, der multer-Fehler (z. B. zu große Datei) sauber
// als verständliche Meldung zurückgibt, statt den Request abstürzen zu lassen.
// (Unter multer 2.x wichtig, damit fehlerhafte Uploads den Prozess nicht stören.)
function belegUpload(req: any, res: any, next: any) {
  upload.single("datei")(req, res, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ fehler: "Datei ist zu groß (max. 10 MB)." });
      }
      return res.status(400).json({ fehler: "Beleg-Upload fehlgeschlagen." });
    }
    next();
  });
}

// Benennt die hochgeladene Belegdatei nach der Belegnummer (z. B. "2026-1370-01.jpg")
// und aktualisiert den gespeicherten Pfad. Fehler hier sind für die bereits
// angelegte Buchung unkritisch und werden nur protokolliert.
async function belegDateiBenennen(belegId: number, belegnummer: string) {
  try {
    const beleg = await prisma.beleg.findUnique({ where: { id: belegId } });
    if (!beleg) return;
    // Endung vom bereits sicher gespeicherten Dateinamen übernehmen (nicht vom
    // Originalnamen – der ist nicht vertrauenswürdig).
    const ext = path.extname(beleg.dateipfad);
    const sicher = belegnummer.replace(/[^\w.-]/g, "_");
    const neuerName = `${sicher}${ext}`;
    if (neuerName === beleg.dateipfad) return;
    const altPfad = path.join(UPLOAD_DIR, path.basename(beleg.dateipfad));
    const neuPfad = path.join(UPLOAD_DIR, neuerName);
    if (fs.existsSync(altPfad)) fs.renameSync(altPfad, neuPfad);
    await prisma.beleg.update({ where: { id: belegId }, data: { dateipfad: neuerName } });
  } catch (e) {
    console.error("Beleg konnte nicht nach Belegnummer umbenannt werden:", e);
  }
}

// Beleg hochladen -> liefert nur die belegId zurück (Datei speichern).
// Die fortlaufende Nummer hängt jetzt an der Buchung, nicht am Beleg.
buchungRouter.post("/belege", angemeldet, belegUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ fehler: "Keine gültige Datei (JPG, PNG, PDF)." });
  const beleg = await prisma.beleg.create({
    data: { dateipfad: req.file.filename, originalname: req.file.originalname },
  });
  res.status(201).json({ belegId: beleg.id });
});

// Liefert die für die Erfassung relevanten, nicht-sensiblen Einstellungen
// (für alle angemeldeten Rollen lesbar): Belegpflicht + Belegfoto-Auflösung.
buchungRouter.get("/einstellungen", angemeldet, async (_req, res) => {
  const k = await prisma.allgemeinKonfig.findFirst({ orderBy: { id: "asc" } });
  res.json({
    belegPflicht: k?.belegPflicht ?? false,
    fotoMaxKantePx: k?.fotoMaxKantePx ?? 1600,
    fotoQualitaet: k?.fotoQualitaet ?? 80,
  });
});

// Beleg anzeigen/herunterladen -> nur für Nutzer mit Zugriff auf die zugehörige Kostenstelle.
buchungRouter.get("/belege/:id", angemeldet, async (req, res) => {
  const id = Number(req.params.id);
  const beleg = await prisma.beleg.findUnique({
    where: { id },
    include: { buchung: true },
  });
  if (!beleg) return res.status(404).json({ fehler: "Beleg nicht gefunden." });

  // Zugriffsprüfung: nur wenn der Beleg an eine Buchung hängt, deren Kostenstelle
  // der Nutzer sehen darf (admin/finanzen sehen alle).
  // Verwaiste Belege (noch an keine Buchung gehängt) werden nicht ausgeliefert –
  // sonst könnte jede angemeldete Person beliebige frisch hochgeladene Belege per
  // ID abrufen. Im normalen Ablauf wird ein Beleg erst nach dem Speichern der
  // Buchung serverseitig angezeigt.
  if (!beleg.buchung) {
    return res.status(404).json({ fehler: "Beleg nicht gefunden." });
  }
  if (!(await darfKostenstelle(req.benutzer!, beleg.buchung.kostenstelleId))) {
    return res.status(403).json({ fehler: "Kein Zugriff auf diesen Beleg." });
  }

  // Pfad ausschließlich aus dem gespeicherten Dateinamen bilden (kein Pfad-Durchgriff).
  const sichererName = path.basename(beleg.dateipfad);
  const vollerPfad = path.join(UPLOAD_DIR, sichererName);
  if (!fs.existsSync(vollerPfad)) {
    return res.status(404).json({ fehler: "Belegdatei fehlt auf dem Server." });
  }

  // Defense-in-depth: kein MIME-Sniffing, Anzeige inline (kein HTML-Rendering).
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(vollerPfad);
});

// --- Buchungen einer Kostenstelle auflisten ---
buchungRouter.get("/", angemeldet, async (req, res) => {
  const kostenstelleId = Number(req.query.kostenstelle);
  if (!kostenstelleId) return res.status(400).json({ fehler: "kostenstelle erforderlich." });
  if (!(await darfKostenstelle(req.benutzer!, kostenstelleId))) {
    return res.status(403).json({ fehler: "Kein Zugriff auf diese Kostenstelle." });
  }
  const buchungen = await prisma.buchung.findMany({
    where: { kostenstelleId },
    include: {
      positionen: { include: { konto: true } },
      beleg: true,
      ersteller: { select: { name: true } },
      korrekturVon: { select: { buchungsnummer: true } },
    },
    orderBy: { buchungsnummer: "desc" },
  });
  res.json(buchungen);
});

// --- Buchung anlegen ---
buchungRouter.post("/", angemeldet, async (req, res) => {
  const eingabe = req.body as BuchungEingabe & { belegId?: number };

  // 1) Zugriff auf Kostenstelle prüfen
  if (!(await darfKostenstelle(req.benutzer!, eingabe.kostenstelleId))) {
    return res.status(403).json({ fehler: "Kein Zugriff auf diese Kostenstelle." });
  }

  // 2) Fachliche Validierung (zentrale, getestete Logik)
  const aktiveSteuersaetze = await prisma.steuersatz.findMany({
    where: { aktiv: true },
    select: { prozent: true },
  });
  const erlaubt = aktiveSteuersaetze.map((s) => s.prozent);
  const pruef = buchungValidieren(eingabe, erlaubt.length ? erlaubt : undefined);
  if (!pruef.ok) return res.status(400).json({ fehler: pruef.fehler });

  // 2b) Beleg-Pflicht (falls vom Administrator aktiviert)
  if (!eingabe.belegId && (await belegPflichtAktiv())) {
    return res.status(400).json({ fehler: "Ein Beleg ist verpflichtend. Bitte einen Beleg anhängen." });
  }

  // 3) Periode darf nicht bereits freigegeben (gesperrt) sein
  const beleg = new Date(eingabe.belegdatum);
  const abschluss = await prisma.abschluss.findUnique({
    where: {
      kostenstelleId_jahr_monat: {
        kostenstelleId: eingabe.kostenstelleId,
        jahr: beleg.getFullYear(),
        monat: beleg.getMonth() + 1,
      },
    },
  });
  if (abschluss && abschluss.status === "freigegeben") {
    return res.status(409).json({ fehler: "Periode ist freigegeben und gesperrt." });
  }

  // 3b) Monatssperre: nach Ablauf der Frist (oder manuell gesperrt) darf nur
  // noch ein Administrator in diesem Monat buchen.
  if (
    req.benutzer!.rolle !== "admin" &&
    (await monatGesperrt(eingabe.kostenstelleId, beleg.getFullYear(), beleg.getMonth() + 1))
  ) {
    return res.status(409).json({
      fehler: "Dieser Monat ist gesperrt. Nur Administratoren können hier noch buchen.",
    });
  }

  // 4) Transaktional speichern: Nummern vergeben, Buchung + Positionen, Saldo, Audit
  const ergebnis = await prisma.$transaction(async (tx) => {
    // Buchungsnummer bleibt global fortlaufend.
    const maxNummer = await tx.buchung.aggregate({ _max: { buchungsnummer: true } });
    const naechsteNummer = (maxNummer._max.buchungsnummer ?? 0) + 1;

    // Belegnummer läuft JE Kostenstelle UND Jahr fortlaufend (Jahr aus Belegdatum).
    const belegJahr = beleg.getFullYear();
    const maxLauf = await tx.buchung.aggregate({
      where: { kostenstelleId: eingabe.kostenstelleId, belegJahr },
      _max: { belegLaufnummer: true },
    });
    const naechsteLaufnummer = (maxLauf._max.belegLaufnummer ?? 0) + 1;

    // Kostenstellen-Nummer für die volle Belegnummer (z. B. "2026-1260-01") holen.
    const ks = await tx.kostenstelle.findUnique({
      where: { id: eingabe.kostenstelleId },
      select: { nummer: true },
    });
    const belegnummer = belegnummerFormat(belegJahr, ks!.nummer, naechsteLaufnummer);

    const buchung = await tx.buchung.create({
      data: {
        buchungsnummer: naechsteNummer,
        belegJahr,
        belegLaufnummer: naechsteLaufnummer,
        belegnummer,
        belegdatum: beleg,
        betragCent: eingabe.betragCent,
        typ: eingabe.typ,
        beschreibung: eingabe.beschreibung,
        kostenstelleId: eingabe.kostenstelleId,
        erstellerId: req.benutzer!.id,
        belegId: eingabe.belegId ?? null,
        positionen: {
          create: eingabe.positionen.map((p) => ({
            betragCent: p.betragCent,
            steuersatz: p.steuersatz,
            kontoId: p.kontoId,
          })),
        },
      },
      include: { positionen: true },
    });

    await tx.kostenstelle.update({
      where: { id: eingabe.kostenstelleId },
      data: { saldoCent: { increment: saldoWirkung(eingabe.typ, eingabe.betragCent) } },
    });

    return buchung;
  });

  // Fotografierten Beleg nach der Belegnummer benennen (z. B. "2026-1370-01.jpg").
  if (eingabe.belegId) await belegDateiBenennen(eingabe.belegId, ergebnis.belegnummer);

  await audit({
    benutzerId: req.benutzer!.id,
    aktion: "buchung.erstellt",
    entitaet: "buchung",
    entitaetId: ergebnis.id,
    neueWerte: ergebnis,
  });

  res.status(201).json(ergebnis);
});

// --- Storno (keine echte Löschung; Revisionssicherheit) ---
buchungRouter.post("/:id/storno", angemeldet, async (req, res) => {
  const id = Number(req.params.id);
  const buchung = await prisma.buchung.findUnique({ where: { id } });
  if (!buchung) return res.status(404).json({ fehler: "Nicht gefunden." });
  if (!(await darfKostenstelle(req.benutzer!, buchung.kostenstelleId))) {
    return res.status(403).json({ fehler: "Kein Zugriff." });
  }
  if (buchung.gesperrt) return res.status(409).json({ fehler: "Buchung ist gesperrt." });
  if (buchung.storniert) return res.status(409).json({ fehler: "Bereits storniert." });

  // Monatssperre: in einem gesperrten Monat darf nur ein Administrator stornieren.
  if (
    req.benutzer!.rolle !== "admin" &&
    (await monatGesperrt(buchung.kostenstelleId, buchung.belegdatum.getFullYear(), buchung.belegdatum.getMonth() + 1))
  ) {
    return res.status(409).json({
      fehler: "Dieser Monat ist gesperrt. Nur Administratoren können hier noch stornieren.",
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.buchung.update({ where: { id }, data: { storniert: true } });
    // Saldo-Wirkung rückgängig machen
    await tx.kostenstelle.update({
      where: { id: buchung.kostenstelleId },
      data: { saldoCent: { increment: -saldoWirkung(buchung.typ, buchung.betragCent) } },
    });
  });

  await audit({
    benutzerId: req.benutzer!.id,
    aktion: "buchung.storniert",
    entitaet: "buchung",
    entitaetId: id,
    alteWerte: buchung,
  });

  res.json({ ok: true });
});

// --- Korrigieren (revisionssicher: Original stornieren + Korrekturbuchung anlegen) ---
// Das Original bleibt unverändert erhalten (storniert), die neue Buchung verweist
// per korrekturVonId darauf. Beide bleiben in der Liste sichtbar.
buchungRouter.post("/:id/korrigieren", angemeldet, async (req, res) => {
  const id = Number(req.params.id);
  const eingabe = req.body as BuchungEingabe & { belegId?: number; korrekturGrund?: string };

  const original = await prisma.buchung.findUnique({ where: { id } });
  if (!original) return res.status(404).json({ fehler: "Nicht gefunden." });
  if (!(await darfKostenstelle(req.benutzer!, original.kostenstelleId))) {
    return res.status(403).json({ fehler: "Kein Zugriff." });
  }
  if (original.gesperrt) return res.status(409).json({ fehler: "Buchung ist gesperrt und kann nicht korrigiert werden." });
  if (original.storniert) return res.status(409).json({ fehler: "Buchung ist bereits storniert." });

  // Fachliche Validierung der Korrektur (gleiche Logik wie beim Anlegen)
  const aktiveSteuersaetze = await prisma.steuersatz.findMany({
    where: { aktiv: true },
    select: { prozent: true },
  });
  const erlaubt = aktiveSteuersaetze.map((s) => s.prozent);
  const pruef = buchungValidieren(eingabe, erlaubt.length ? erlaubt : undefined);
  if (!pruef.ok) return res.status(400).json({ fehler: pruef.fehler });

  // Beleg-Pflicht gilt auch für die Korrektur (neue Buchung).
  if (!eingabe.belegId && (await belegPflichtAktiv())) {
    return res.status(400).json({ fehler: "Ein Beleg ist verpflichtend. Bitte einen Beleg anhängen." });
  }

  // Periode der KORREKTUR darf nicht freigegeben sein
  const neuesBelegdatum = new Date(eingabe.belegdatum);
  const abschluss = await prisma.abschluss.findUnique({
    where: {
      kostenstelleId_jahr_monat: {
        kostenstelleId: eingabe.kostenstelleId,
        jahr: neuesBelegdatum.getFullYear(),
        monat: neuesBelegdatum.getMonth() + 1,
      },
    },
  });
  if (abschluss && abschluss.status === "freigegeben") {
    return res.status(409).json({ fehler: "Periode ist freigegeben und gesperrt." });
  }

  // Monatssperre: weder die Original- noch die Ziel-Periode dürfen für
  // Nicht-Admins gesperrt sein.
  if (req.benutzer!.rolle !== "admin") {
    const origGesperrt = await monatGesperrt(
      original.kostenstelleId,
      original.belegdatum.getFullYear(),
      original.belegdatum.getMonth() + 1
    );
    const zielGesperrt = await monatGesperrt(
      eingabe.kostenstelleId,
      neuesBelegdatum.getFullYear(),
      neuesBelegdatum.getMonth() + 1
    );
    if (origGesperrt || zielGesperrt) {
      return res.status(409).json({
        fehler: "Dieser Monat ist gesperrt. Nur Administratoren können hier noch korrigieren.",
      });
    }
  }

  const ergebnis = await prisma.$transaction(async (tx) => {
    // 1) Original stornieren und dessen Saldo-Wirkung rückgängig machen
    await tx.buchung.update({ where: { id }, data: { storniert: true } });
    await tx.kostenstelle.update({
      where: { id: original.kostenstelleId },
      data: { saldoCent: { increment: -saldoWirkung(original.typ, original.betragCent) } },
    });

    // 2) Neue Korrekturbuchung anlegen (verweist auf das Original)
    const maxNummer = await tx.buchung.aggregate({ _max: { buchungsnummer: true } });
    const naechsteNummer = (maxNummer._max.buchungsnummer ?? 0) + 1;

    // Belegnummer der Korrektur läuft je Kostenstelle und Jahr weiter (Jahr aus Belegdatum).
    const belegJahr = neuesBelegdatum.getFullYear();
    const maxLauf = await tx.buchung.aggregate({
      where: { kostenstelleId: eingabe.kostenstelleId, belegJahr },
      _max: { belegLaufnummer: true },
    });
    const naechsteLaufnummer = (maxLauf._max.belegLaufnummer ?? 0) + 1;

    const ksK = await tx.kostenstelle.findUnique({
      where: { id: eingabe.kostenstelleId },
      select: { nummer: true },
    });
    const belegnummer = belegnummerFormat(belegJahr, ksK!.nummer, naechsteLaufnummer);

    const korrektur = await tx.buchung.create({
      data: {
        buchungsnummer: naechsteNummer,
        belegJahr,
        belegLaufnummer: naechsteLaufnummer,
        belegnummer,
        belegdatum: neuesBelegdatum,
        betragCent: eingabe.betragCent,
        typ: eingabe.typ,
        beschreibung: eingabe.beschreibung,
        kostenstelleId: eingabe.kostenstelleId,
        erstellerId: req.benutzer!.id,
        belegId: eingabe.belegId ?? null,
        korrekturVonId: id,
        korrekturGrund: eingabe.korrekturGrund || null,
        positionen: {
          create: eingabe.positionen.map((p) => ({
            betragCent: p.betragCent,
            steuersatz: p.steuersatz,
            kontoId: p.kontoId,
          })),
        },
      },
      include: { positionen: true },
    });

    // 3) Saldo-Wirkung der Korrektur anwenden
    await tx.kostenstelle.update({
      where: { id: eingabe.kostenstelleId },
      data: { saldoCent: { increment: saldoWirkung(eingabe.typ, eingabe.betragCent) } },
    });

    return korrektur;
  });

  // Fotografierten Beleg der Korrektur nach der Belegnummer benennen.
  if (eingabe.belegId) await belegDateiBenennen(eingabe.belegId, ergebnis.belegnummer);

  await audit({
    benutzerId: req.benutzer!.id,
    aktion: "buchung.korrigiert",
    entitaet: "buchung",
    entitaetId: ergebnis.id,
    alteWerte: original,
    neueWerte: ergebnis,
  });

  res.status(201).json(ergebnis);
});
