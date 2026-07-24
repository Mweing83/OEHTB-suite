import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auditLog } from "../lib/audit";
import { AuthRequest, authPflicht, rollePflicht } from "../middleware/auth";
import {
  alleMitarbeiterMitStand,
  standFuerMitarbeiter,
  staendeZumStichtag,
  StichtagZeile,
} from "../services/beschaeftigung";

export const mitarbeiterRouter = Router();

// Alle Routen erfordern Anmeldung.
mitarbeiterRouter.use(authPflicht);

// ---------------------------------------------------------------------------
// GET /api/mitarbeiter  – Dashboard-Liste mit aktuellem Stand
// Optional ?alle=1 zeigt auch inaktive Mitarbeiter.
// ---------------------------------------------------------------------------
mitarbeiterRouter.get("/", async (req: AuthRequest, res: Response) => {
  const alle = req.query.alle === "1";
  const liste = await alleMitarbeiterMitStand(!alle);
  res.json(liste);
});

// ---------------------------------------------------------------------------
// CSV-Hilfen (deutsches Excel-Format: Trennzeichen ";", Dezimalkomma,
// UTF-8-BOM, damit Excel-DE die Datei sauber oeffnet).
// ---------------------------------------------------------------------------
function csvFeld(s: string): string {
  // Bei ; " oder Zeilenumbruch: in Anfuehrungszeichen setzen, " verdoppeln.
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function zahlDe(n: number): string {
  return String(n).replace(".", ",");
}

function datumDe(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}/${m}/${j}`;
}

function csvErzeugen(kopf: string[], zeilen: string[][]): string {
  const text = [kopf, ...zeilen]
    .map((z) => z.map(csvFeld).join(";"))
    .join("\r\n");
  return "﻿" + text + "\r\n"; // UTF-8-BOM fuer Excel-DE
}

// Heute um Mitternacht (UTC), analog zur Historien-Logik.
function heuteUtc(): Date {
  const j = new Date();
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()));
}

// Baut eine CSV-Tabelle aus Stichtags-Zeilen (gemeinsames Format fuer beide
// Exporte, damit aktueller Stand und Monats-Stand vergleichbar bleiben).
function stichtagCsv(zeilen: StichtagZeile[], stichtagIso: string): string {
  const kopf = [
    "Personalnummer", "Nachname", "Vorname", "Bereich", "Status",
    "Wochenstunden", "Ausmass_Prozent", "FTE", "Gueltig_ab", "Stichtag",
  ];
  const daten = zeilen.map((z) => [
    z.personalnummer,
    z.nachname,
    z.vorname,
    z.bereich ?? "",
    z.aktiv ? "aktiv" : "inaktiv",
    zahlDe(z.wochenstunden),
    zahlDe(z.ausmassProzent),
    zahlDe(Math.round((z.ausmassProzent / 100) * 1000) / 1000),
    datumDe(z.gueltigAb),
    datumDe(stichtagIso),
  ]);
  return csvErzeugen(kopf, daten);
}

// ---------------------------------------------------------------------------
// GET /api/mitarbeiter/export/aktuell  – aktueller Stand aller AKTIVEN
// Mitarbeiter als CSV (Excel-DE).
// ---------------------------------------------------------------------------
mitarbeiterRouter.get(
  "/export/aktuell",
  // Massenexport personenbezogener Daten: nicht fuer die Rolle "leser".
  rollePflicht("admin", "sachbearbeiter", "personalverrechnung"),
  async (req: AuthRequest, res: Response) => {
    const heute = heuteUtc();
    const stichtagIso = heute.toISOString().slice(0, 10);
    const zeilen = await staendeZumStichtag(heute, true);
    const csv = stichtagCsv(zeilen, stichtagIso);

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "MITARBEITER_EXPORT_AKTUELL",
      details: { anzahl: zeilen.length },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="stand_aktuell_${stichtagIso}.csv"`
    );
    res.send(csv);
  }
);

// ---------------------------------------------------------------------------
// GET /api/mitarbeiter/export/stichtag?monat=YYYY-MM  – Zustand aller
// Mitarbeiter zum Monatsende des gewaehlten Monats als CSV (Excel-DE).
// ---------------------------------------------------------------------------
mitarbeiterRouter.get(
  "/export/stichtag",
  // Massenexport personenbezogener Daten: nicht fuer die Rolle "leser".
  rollePflicht("admin", "sachbearbeiter", "personalverrechnung"),
  async (req: AuthRequest, res: Response) => {
    const monat = typeof req.query.monat === "string" ? req.query.monat : "";
    const treffer = /^(\d{4})-(\d{2})$/.exec(monat);
    if (!treffer) {
      res.status(400).json({ fehler: "Monat im Format JJJJ-MM angeben." });
      return;
    }
    const jahr = Number(treffer[1]);
    const mon = Number(treffer[2]); // 1-basiert
    if (mon < 1 || mon > 12) {
      res.status(400).json({ fehler: "Ungültiger Monat." });
      return;
    }

    // Stichtag = letzter Tag des Monats (UTC). Date.UTC(jahr, mon, 0) liefert
    // den letzten Tag des 1-basierten Monats "mon".
    const stichtag = new Date(Date.UTC(jahr, mon, 0));
    const stichtagIso = stichtag.toISOString().slice(0, 10);

    // Alle (auch inaktive) mit Stand am Stichtag – siehe Hinweis: Austritte
    // sind im Datenmodell nicht datiert.
    const zeilen = await staendeZumStichtag(stichtag, false);
    const csv = stichtagCsv(zeilen, stichtagIso);

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "MITARBEITER_EXPORT_STICHTAG",
      details: { monat, anzahl: zeilen.length },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="stand_${monat}.csv"`
    );
    res.send(csv);
  }
);

// ---------------------------------------------------------------------------
// GET /api/mitarbeiter/:id  – Detail mit vollstaendiger Historie
// ---------------------------------------------------------------------------
mitarbeiterRouter.get("/:id", async (req: AuthRequest, res: Response) => {
  const m = await prisma.mitarbeiter.findUnique({
    where: { id: req.params.id },
    include: {
      beschaeftigungen: { orderBy: { gueltigAb: "desc" } },
    },
  });
  if (!m) {
    res.status(404).json({ fehler: "Mitarbeiter nicht gefunden." });
    return;
  }

  const stand = await standFuerMitarbeiter(m.id);

  await auditLog({
    userId: req.benutzer?.userId,
    aktion: "MITARBEITER_ANSEHEN",
    betroffenerMitarbeiterId: m.id,
  });

  res.json({
    id: m.id,
    vorname: m.vorname,
    nachname: m.nachname,
    personalnummer: m.personalnummer,
    email: m.email,
    bereich: m.bereich,
    aktiv: m.aktiv,
    austrittAm: m.austrittAm ? m.austrittAm.toISOString().slice(0, 10) : null,
    erstelltAm: m.erstelltAm,
    ...stand,
    historie: m.beschaeftigungen.map((b) => ({
      id: b.id,
      wochenstunden: Number(b.wochenstunden),
      ausmassProzent: Number(b.ausmassProzent),
      gueltigAb: b.gueltigAb.toISOString().slice(0, 10),
      erfasstAm: b.erfasstAm,
      quelle: b.quelle,
      notiz: b.notiz,
    })),
  });
});

// ---------------------------------------------------------------------------
// POST /api/mitarbeiter  – neuen Mitarbeiter anlegen (Stammdaten)
// Nur admin und sachbearbeiter.
// ---------------------------------------------------------------------------
const mitarbeiterSchema = z.object({
  vorname: z.string().min(1),
  nachname: z.string().min(1),
  personalnummer: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  bereich: z.string().optional().or(z.literal("")),
  // Austrittsdatum (letzter Beschaeftigungstag). "" loescht den Wert.
  austrittAm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});

mitarbeiterRouter.post(
  "/",
  rollePflicht("admin", "sachbearbeiter"),
  async (req: AuthRequest, res: Response) => {
    const parse = mitarbeiterSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ fehler: "Ungueltige Eingabe." });
      return;
    }
    const d = parse.data;

    const vorhanden = await prisma.mitarbeiter.findUnique({
      where: { personalnummer: d.personalnummer },
    });
    if (vorhanden) {
      res.status(409).json({ fehler: "Personalnummer bereits vergeben." });
      return;
    }

    const m = await prisma.mitarbeiter.create({
      data: {
        vorname: d.vorname,
        nachname: d.nachname,
        personalnummer: d.personalnummer,
        email: d.email || null,
        bereich: d.bereich || null,
      },
    });

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "MITARBEITER_ANLEGEN",
      betroffenerMitarbeiterId: m.id,
    });

    res.status(201).json(m);
  }
);

// ---------------------------------------------------------------------------
// PUT /api/mitarbeiter/:id  – Stammdaten bearbeiten
// Nur admin und sachbearbeiter.
// ---------------------------------------------------------------------------
mitarbeiterRouter.put(
  "/:id",
  rollePflicht("admin", "sachbearbeiter"),
  async (req: AuthRequest, res: Response) => {
    const parse = mitarbeiterSchema.partial().safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ fehler: "Ungueltige Eingabe." });
      return;
    }
    const d = parse.data;

    // Personalnummer ist eindeutig: bei Aenderung pruefen, ob sie schon
    // einer ANDEREN Person gehoert (sonst liefert Prisma einen rohen 500).
    if (d.personalnummer !== undefined) {
      const kollision = await prisma.mitarbeiter.findUnique({
        where: { personalnummer: d.personalnummer },
      });
      if (kollision && kollision.id !== req.params.id) {
        res.status(409).json({ fehler: "Personalnummer bereits vergeben." });
        return;
      }
    }

    const m = await prisma.mitarbeiter.update({
      where: { id: req.params.id },
      data: {
        ...(d.vorname !== undefined ? { vorname: d.vorname } : {}),
        ...(d.nachname !== undefined ? { nachname: d.nachname } : {}),
        ...(d.personalnummer !== undefined
          ? { personalnummer: d.personalnummer }
          : {}),
        ...(d.email !== undefined ? { email: d.email || null } : {}),
        ...(d.bereich !== undefined ? { bereich: d.bereich || null } : {}),
        ...(d.austrittAm !== undefined
          ? {
              austrittAm: d.austrittAm
                ? new Date(d.austrittAm + "T00:00:00.000Z")
                : null,
            }
          : {}),
      },
    });

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "MITARBEITER_BEARBEITEN",
      betroffenerMitarbeiterId: m.id,
    });

    res.json(m);
  }
);

// ---------------------------------------------------------------------------
// POST /api/mitarbeiter/:id/beschaeftigung  – manuelle Aenderung erfassen
// Legt einen NEUEN Beschaeftigung-Datensatz an (Historie, nie ueberschreiben).
// Nur admin und sachbearbeiter.
// ---------------------------------------------------------------------------
const beschaeftigungSchema = z.object({
  wochenstunden: z.number().positive().max(168),
  ausmassProzent: z.number().positive().max(100),
  gueltigAb: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  notiz: z.string().optional(),
});

mitarbeiterRouter.post(
  "/:id/beschaeftigung",
  rollePflicht("admin", "sachbearbeiter"),
  async (req: AuthRequest, res: Response) => {
    const parse = beschaeftigungSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        fehler: parse.error.issues[0]?.message ?? "Ungueltige Eingabe.",
      });
      return;
    }
    const d = parse.data;

    const m = await prisma.mitarbeiter.findUnique({
      where: { id: req.params.id },
    });
    if (!m) {
      res.status(404).json({ fehler: "Mitarbeiter nicht gefunden." });
      return;
    }

    const neu = await prisma.beschaeftigung.create({
      data: {
        mitarbeiterId: m.id,
        wochenstunden: d.wochenstunden,
        ausmassProzent: d.ausmassProzent,
        gueltigAb: new Date(d.gueltigAb + "T00:00:00.000Z"),
        quelle: "MANUELL",
        erfasstVon: req.benutzer?.userId ?? null,
        notiz: d.notiz || null,
      },
    });

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "BESCHAEFTIGUNG_ERFASSEN",
      betroffenerMitarbeiterId: m.id,
      details: {
        wochenstunden: d.wochenstunden,
        ausmassProzent: d.ausmassProzent,
        gueltigAb: d.gueltigAb,
      },
    });

    res.status(201).json({
      id: neu.id,
      wochenstunden: Number(neu.wochenstunden),
      ausmassProzent: Number(neu.ausmassProzent),
      gueltigAb: neu.gueltigAb.toISOString().slice(0, 10),
    });
  }
);

// Datum im europaeischen Layout: DD/MM/YYYY.
function datumEu(d: Date): string {
  const tag = String(d.getDate()).padStart(2, "0");
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  return `${tag}/${monat}/${d.getFullYear()}`;
}

// Zeitstempel im europaeischen Layout: DD/MM/YYYY, HH:MM:SS.
function datumZeitEu(d: Date): string {
  const stunde = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  const sekunde = String(d.getSeconds()).padStart(2, "0");
  return `${datumEu(d)}, ${stunde}:${minute}:${sekunde}`;
}

// ---------------------------------------------------------------------------
// GET /api/mitarbeiter/:id/export  – DSGVO-Auskunft (Art. 15)
// Liefert ALLE zu einer Person gespeicherten Daten als JSON zum Download.
// ---------------------------------------------------------------------------
mitarbeiterRouter.get(
  "/:id/export",
  // DSGVO-Volldatenexport einer Person: nicht fuer die Rolle "leser".
  rollePflicht("admin", "sachbearbeiter", "personalverrechnung"),
  async (req: AuthRequest, res: Response) => {
    const m = await prisma.mitarbeiter.findUnique({
      where: { id: req.params.id },
      include: { beschaeftigungen: { orderBy: { gueltigAb: "asc" } } },
    });
    if (!m) {
      res.status(404).json({ fehler: "Mitarbeiter nicht gefunden." });
      return;
    }

    // Anfragen, die diese Person betreffen (ueber die Beschaeftigungen).
    const anfrageIds = m.beschaeftigungen
      .map((b) => b.aenderungsanfrageId)
      .filter((x): x is string => Boolean(x));
    const anfragen = anfrageIds.length
      ? await prisma.aenderungsanfrage.findMany({
          where: { id: { in: anfrageIds } },
          select: {
            id: true,
            rohtext: true,
            eingegangenAm: true,
            quelle: true,
            status: true,
          },
        })
      : [];

    const auditEintraege = await prisma.auditLog.findMany({
      where: { betroffenerMitarbeiterId: m.id },
      orderBy: { zeitpunkt: "asc" },
      select: { aktion: true, zeitpunkt: true, userId: true },
    });

    const export_ = {
      exportErzeugtAm: datumZeitEu(new Date()),
      hinweis:
        "DSGVO-Auskunft nach Art. 15. Enthaelt alle zu dieser Person gespeicherten Daten. Datumsangaben im Format TT/MM/JJJJ.",
      stammdaten: {
        vorname: m.vorname,
        nachname: m.nachname,
        personalnummer: m.personalnummer,
        email: m.email,
        bereich: m.bereich,
        aktiv: m.aktiv,
        erstelltAm: datumZeitEu(m.erstelltAm),
      },
      beschaeftigungsverlauf: m.beschaeftigungen.map((b) => ({
        wochenstunden: Number(b.wochenstunden),
        ausmassProzent: Number(b.ausmassProzent),
        gueltigAb: datumEu(b.gueltigAb),
        erfasstAm: datumZeitEu(b.erfasstAm),
        quelle: b.quelle,
        notiz: b.notiz,
      })),
      zugehoerigeAnfragen: anfragen.map((a) => ({
        ...a,
        eingegangenAm: datumZeitEu(a.eingegangenAm),
      })),
      protokoll: auditEintraege.map((e) => ({
        ...e,
        zeitpunkt: datumZeitEu(e.zeitpunkt),
      })),
    };

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "MITARBEITER_EXPORT",
      betroffenerMitarbeiterId: m.id,
    });

    const dateiname = `export_${m.personalnummer}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${dateiname}"`
    );
    res.send(JSON.stringify(export_, null, 2));
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/mitarbeiter/:id  – DSGVO-Loeschung (Art. 17)
// Nur admin. Zwei Modi:
//   - Standard: anonymisieren/deaktivieren (Aufbewahrungsfristen wahren)
//   - ?hart=1: vollstaendig loeschen (inkl. Historie) – nur wenn keine
//     gesetzliche Aufbewahrungspflicht mehr besteht.
// ---------------------------------------------------------------------------
mitarbeiterRouter.delete(
  "/:id",
  rollePflicht("admin"),
  async (req: AuthRequest, res: Response) => {
    const hart = req.query.hart === "1";
    const m = await prisma.mitarbeiter.findUnique({
      where: { id: req.params.id },
    });
    if (!m) {
      res.status(404).json({ fehler: "Mitarbeiter nicht gefunden." });
      return;
    }

    if (hart) {
      // Vollstaendige Loeschung (Cascade entfernt Beschaeftigungen).
      await prisma.mitarbeiter.delete({ where: { id: m.id } });
      await auditLog({
        userId: req.benutzer?.userId,
        aktion: "MITARBEITER_HART_GELOESCHT",
        betroffenerMitarbeiterId: m.id,
        details: { personalnummer: m.personalnummer },
      });
      res.json({ ok: true, modus: "hart" });
      return;
    }

    // Standard: Stammdaten anonymisieren, Person deaktivieren, Verlauf
    // (entpersonalisiert) bleibt fuer Aufbewahrungsfristen erhalten.
    await prisma.mitarbeiter.update({
      where: { id: m.id },
      data: {
        vorname: "Geloescht",
        nachname: "Geloescht",
        email: null,
        aktiv: false,
        // Personalnummer bleibt als technischer Schluessel, ggf. anonymisiert:
        personalnummer: `GELOESCHT-${m.id.slice(0, 8)}`,
      },
    });

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "MITARBEITER_ANONYMISIERT",
      betroffenerMitarbeiterId: m.id,
    });

    res.json({ ok: true, modus: "anonymisiert" });
  }
);
