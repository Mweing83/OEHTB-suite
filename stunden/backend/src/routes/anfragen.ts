import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auditLog } from "../lib/audit";
import { AuthRequest, authPflicht, rollePflicht } from "../middleware/auth";
import {
  anfrageVerarbeiten,
  ladeWorkflowKonfig,
  istUebernahmefaehig,
  AufbereitetesErgebnis,
} from "../services/anfrage";

export const anfragenRouter = Router();

anfragenRouter.use(authPflicht);

// ---------------------------------------------------------------------------
// POST /api/anfragen  – neuen Text einreichen (Copy & Paste)
// Legt die Anfrage an, verarbeitet sie (Pseudonym + KI) und entscheidet je
// nach Workflow-Modus, ob automatisch uebernommen oder zur Bestaetigung gelegt.
// ---------------------------------------------------------------------------
const einreichenSchema = z.object({
  rohtext: z.string().min(3),
});

anfragenRouter.post(
  "/",
  rollePflicht("admin", "sachbearbeiter"),
  async (req: AuthRequest, res: Response) => {
    const parse = einreichenSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ fehler: "Bitte einen Text eingeben." });
      return;
    }

    // 1. Anfrage anlegen
    const anfrage = await prisma.aenderungsanfrage.create({
      data: {
        rohtext: parse.data.rohtext,
        quelle: "PASTE",
        status: "NEU",
      },
    });

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "ANFRAGE_EINGEREICHT",
      details: { anfrageId: anfrage.id, quelle: "PASTE" },
    });

    // 2. Verarbeiten (Pseudonym + KI + Re-Identifikation)
    try {
      await anfrageVerarbeiten(anfrage.id);
    } catch {
      // Fehlerstatus ist bereits gesetzt; Anfrage trotzdem zurueckgeben.
      const fehlerhaft = await prisma.aenderungsanfrage.findUnique({
        where: { id: anfrage.id },
      });
      res.status(200).json(fehlerhaft);
      return;
    }

    // 3. Workflow-Modus auswerten
    const aktualisiert = await prisma.aenderungsanfrage.findUnique({
      where: { id: anfrage.id },
    });
    const ergebnis =
      (aktualisiert?.parseErgebnis as unknown as AufbereitetesErgebnis) ?? null;
    const konfig = await ladeWorkflowKonfig();

    let automatischUebernehmen = false;
    if (ergebnis && istUebernahmefaehig(ergebnis)) {
      if (konfig.modus === "automatisch") {
        automatischUebernehmen = true;
      } else if (
        konfig.modus === "ab_konfidenz" &&
        ergebnis.konfidenz >= konfig.konfidenzSchwelle
      ) {
        automatischUebernehmen = true;
      }
    }

    if (automatischUebernehmen && ergebnis) {
      await uebernehmen(anfrage.id, ergebnis, req.benutzer?.userId ?? null, true);
      const fertig = await prisma.aenderungsanfrage.findUnique({
        where: { id: anfrage.id },
      });
      res.json(fertig);
      return;
    }

    // Sonst: zur Bestaetigung legen
    await prisma.aenderungsanfrage.update({
      where: { id: anfrage.id },
      data: { status: "ZUR_BESTAETIGUNG" },
    });
    const fertig = await prisma.aenderungsanfrage.findUnique({
      where: { id: anfrage.id },
    });
    res.json(fertig);
  }
);

// ---------------------------------------------------------------------------
// GET /api/anfragen  – offene Anfragen (Queue)
// Ohne Filter: die fuer HR offenen (NEU/GEPARSED/ZUR_BESTAETIGUNG/FEHLER).
// ?verarbeitung=offen: bestaetigte, noch nicht verarbeitete (fuer Verrechnung).
// ?status=...: gezielt nach einem Status filtern.
// ---------------------------------------------------------------------------
anfragenRouter.get("/", async (req: AuthRequest, res: Response) => {
  const status = req.query.status as string | undefined;
  const verarbeitung = req.query.verarbeitung as string | undefined;

  let where: any;
  if (status) {
    where = { status: status as any };
  } else if (verarbeitung === "offen") {
    // Arbeitsliste der Personalverrechnung: bestaetigt, aber noch nicht
    // in die externen Systeme uebertragen.
    where = { status: "BESTAETIGT" as any };
  } else {
    where = {
      status: { in: ["NEU", "GEPARSED", "ZUR_BESTAETIGUNG", "FEHLER"] as any },
    };
  }

  const anfragen = await prisma.aenderungsanfrage.findMany({
    where,
    orderBy: { eingegangenAm: "desc" },
  });

  // Mitarbeiter-Namen fuer die Anzeige aufloesen (nur fuer die UI, lokal).
  const ergebnisse = await Promise.all(
    anfragen.map(async (a) => {
      const e = a.parseErgebnis as unknown as AufbereitetesErgebnis | null;
      let mitarbeiterName: string | null = null;
      if (e?.mitarbeiterId) {
        const m = await prisma.mitarbeiter.findUnique({
          where: { id: e.mitarbeiterId },
          select: { vorname: true, nachname: true },
        });
        if (m) mitarbeiterName = `${m.nachname}, ${m.vorname}`;
      }
      return {
        id: a.id,
        rohtext: a.rohtext,
        eingegangenAm: a.eingegangenAm,
        quelle: a.quelle,
        status: a.status,
        konfidenz: a.konfidenz,
        ergebnis: e,
        mitarbeiterName,
        bearbeitetAm: a.bearbeitetAm,
        verarbeitetAm: a.verarbeitetAm,
      };
    })
  );

  res.json(ergebnisse);
});

// ---------------------------------------------------------------------------
// POST /api/anfragen/:id/bestaetigen  – Aenderung uebernehmen
// Optional koennen korrigierte Werte mitgegeben werden.
// ---------------------------------------------------------------------------
const bestaetigenSchema = z.object({
  mitarbeiterId: z.string().min(1),
  wochenstunden: z.number().positive().max(168),
  ausmassProzent: z.number().positive().max(100),
  gueltigAb: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notiz: z.string().optional(),
});

anfragenRouter.post(
  "/:id/bestaetigen",
  rollePflicht("admin", "sachbearbeiter", "personalverrechnung"),
  async (req: AuthRequest, res: Response) => {
    const parse = bestaetigenSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        fehler:
          "Bitte Mitarbeiter, Stunden, Ausmaß und gültiges Datum angeben.",
      });
      return;
    }
    const d = parse.data;

    const anfrage = await prisma.aenderungsanfrage.findUnique({
      where: { id: req.params.id },
    });
    if (!anfrage) {
      res.status(404).json({ fehler: "Anfrage nicht gefunden." });
      return;
    }

    // Neuen Beschaeftigung-Eintrag anlegen (Historie).
    await prisma.beschaeftigung.create({
      data: {
        mitarbeiterId: d.mitarbeiterId,
        wochenstunden: d.wochenstunden,
        ausmassProzent: d.ausmassProzent,
        gueltigAb: new Date(d.gueltigAb + "T00:00:00.000Z"),
        quelle: "MAIL_PASTE",
        erfasstVon: req.benutzer?.userId ?? null,
        aenderungsanfrageId: anfrage.id,
        notiz: d.notiz || null,
      },
    });

    await prisma.aenderungsanfrage.update({
      where: { id: anfrage.id },
      data: {
        status: "BESTAETIGT",
        bearbeitetVon: req.benutzer?.userId ?? null,
        bearbeitetAm: new Date(),
      },
    });

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "ANFRAGE_BESTAETIGT",
      betroffenerMitarbeiterId: d.mitarbeiterId,
      details: { anfrageId: anfrage.id },
    });

    res.json({ ok: true });
  }
);

// ---------------------------------------------------------------------------
// POST /api/anfragen/:id/ablehnen  – Anfrage ablehnen
// ---------------------------------------------------------------------------
anfragenRouter.post(
  "/:id/ablehnen",
  rollePflicht("admin", "sachbearbeiter", "personalverrechnung"),
  async (req: AuthRequest, res: Response) => {
    const grund =
      typeof req.body?.grund === "string" ? req.body.grund : null;

    const anfrage = await prisma.aenderungsanfrage.update({
      where: { id: req.params.id },
      data: {
        status: "ABGELEHNT",
        ablehnungsgrund: grund,
        bearbeitetVon: req.benutzer?.userId ?? null,
        bearbeitetAm: new Date(),
      },
    });

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "ANFRAGE_ABGELEHNT",
      details: { anfrageId: anfrage.id, grund },
    });

    res.json({ ok: true });
  }
);

// ---------------------------------------------------------------------------
// POST /api/anfragen/:id/verarbeiten  – als verarbeitet markieren
// Zweite Stufe: Die Personalverrechnung hat die bestaetigte Aenderung in die
// externen Systeme (Buchhaltung, Lohnverrechnung) eingepflegt.
// Nur admin und personalverrechnung.
// ---------------------------------------------------------------------------
anfragenRouter.post(
  "/:id/verarbeiten",
  rollePflicht("admin", "personalverrechnung"),
  async (req: AuthRequest, res: Response) => {
    const notiz =
      typeof req.body?.notiz === "string" ? req.body.notiz : null;

    const anfrage = await prisma.aenderungsanfrage.findUnique({
      where: { id: req.params.id },
    });
    if (!anfrage) {
      res.status(404).json({ fehler: "Anfrage nicht gefunden." });
      return;
    }
    if (anfrage.status !== "BESTAETIGT") {
      res.status(409).json({
        fehler: "Nur best\u00e4tigte Anfragen k\u00f6nnen verarbeitet werden.",
      });
      return;
    }

    await prisma.aenderungsanfrage.update({
      where: { id: anfrage.id },
      data: {
        status: "VERARBEITET",
        verarbeitetVon: req.benutzer?.userId ?? null,
        verarbeitetAm: new Date(),
        verarbeitungNotiz: notiz,
      },
    });

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "ANFRAGE_VERARBEITET",
      details: { anfrageId: anfrage.id },
    });

    res.json({ ok: true });
  }
);

// ---------------------------------------------------------------------------
// POST /api/anfragen/:id/zurueck  – bestaetigte Anfrage zurueck an HR
// Die Personalverrechnung gibt eine bereits bestaetigte Anfrage zur erneuten
// Pruefung zurueck. Die zugehoerige Beschaeftigungsaenderung wird rueckgaengig
// gemacht (geloescht), damit nichts Falsches im Dashboard steht.
// Nur admin und personalverrechnung.
// ---------------------------------------------------------------------------
anfragenRouter.post(
  "/:id/zurueck",
  rollePflicht("admin", "personalverrechnung"),
  async (req: AuthRequest, res: Response) => {
    const grund =
      typeof req.body?.grund === "string" ? req.body.grund : null;

    const anfrage = await prisma.aenderungsanfrage.findUnique({
      where: { id: req.params.id },
    });
    if (!anfrage) {
      res.status(404).json({ fehler: "Anfrage nicht gefunden." });
      return;
    }
    if (anfrage.status !== "BESTAETIGT") {
      res.status(409).json({
        fehler: "Nur best\u00e4tigte Anfragen k\u00f6nnen zur\u00fcckgegeben werden.",
      });
      return;
    }

    // Die durch die Bestaetigung angelegte Beschaeftigungsaenderung entfernen,
    // damit das Dashboard wieder den Stand vor der Bestaetigung zeigt.
    const entfernt = await prisma.beschaeftigung.deleteMany({
      where: { aenderungsanfrageId: anfrage.id },
    });

    await prisma.aenderungsanfrage.update({
      where: { id: anfrage.id },
      data: {
        status: "ZUR_BESTAETIGUNG",
        ablehnungsgrund: grund, // Grund der Rueckgabe, fuer HR sichtbar
        // Verarbeitungsfelder zuruecksetzen.
        verarbeitetVon: null,
        verarbeitetAm: null,
        verarbeitungNotiz: null,
      },
    });

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "ANFRAGE_ZURUECK_AN_HR",
      details: {
        anfrageId: anfrage.id,
        grund,
        entfernteBeschaeftigungen: entfernt.count,
      },
    });

    res.json({ ok: true });
  }
);

// Interne Hilfsfunktion fuer automatische Uebernahme.
async function uebernehmen(
  anfrageId: string,
  ergebnis: AufbereitetesErgebnis,
  userId: string | null,
  automatisch: boolean
): Promise<void> {
  if (!ergebnis.mitarbeiterId || ergebnis.neuStunden === null || !ergebnis.gueltigAb)
    return;

  await prisma.beschaeftigung.create({
    data: {
      mitarbeiterId: ergebnis.mitarbeiterId,
      wochenstunden: ergebnis.neuStunden,
      ausmassProzent: ergebnis.ausmassProzent ?? 0,
      gueltigAb: new Date(ergebnis.gueltigAb + "T00:00:00.000Z"),
      quelle: "MAIL_PASTE",
      erfasstVon: userId,
      aenderungsanfrageId: anfrageId,
      notiz: automatisch ? "Automatisch übernommen" : null,
    },
  });

  await prisma.aenderungsanfrage.update({
    where: { id: anfrageId },
    data: {
      status: "BESTAETIGT",
      bearbeitetVon: userId,
      bearbeitetAm: new Date(),
    },
  });

  await auditLog({
    userId,
    aktion: automatisch ? "ANFRAGE_AUTOMATISCH_UEBERNOMMEN" : "ANFRAGE_BESTAETIGT",
    betroffenerMitarbeiterId: ergebnis.mitarbeiterId,
    details: { anfrageId },
  });
}
