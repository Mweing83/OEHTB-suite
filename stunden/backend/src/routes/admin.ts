import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ollamaBasisUrl } from "../lib/ollamaEndpoint";
import { verschluesseln } from "../lib/krypto";
import { auditLog } from "../lib/audit";
import { AuthRequest, authPflicht, rollePflicht } from "../middleware/auth";
import { imapAbrufen, ladeImapKonfig, ladeErlaubteAbsender } from "../services/imap";
import { ladeVollzeitStunden, VOLLZEIT_SCHLUESSEL } from "../services/llm/factory";
import { ollamaStatus, installStarten } from "../services/ollamaInstall";

export const adminRouter = Router();

// Alle Admin-Routen erfordern Anmeldung UND die Rolle admin.
adminRouter.use(authPflicht);
adminRouter.use(rollePflicht("admin"));

const LLM_SCHLUESSEL = "llm_konfig";
const WORKFLOW_SCHLUESSEL = "workflow_konfig";
const IMAP_SCHLUESSEL = "imap_konfig";
const ABSENDER_SCHLUESSEL = "imap_erlaubte_absender";

// ---------------------------------------------------------------------------
// GET /api/admin/einstellungen  – aktuelle Konfiguration (ohne Klartext-Key)
// ---------------------------------------------------------------------------
adminRouter.get("/einstellungen", async (_req: AuthRequest, res: Response) => {
  const llm = await prisma.einstellung.findUnique({
    where: { schluessel: LLM_SCHLUESSEL },
  });
  const workflow = await prisma.einstellung.findUnique({
    where: { schluessel: WORKFLOW_SCHLUESSEL },
  });

  const llmWert = (llm?.wert as Record<string, unknown>) ?? {};
  const workflowWert = (workflow?.wert as Record<string, unknown>) ?? {};
  const vollzeitStunden = await ladeVollzeitStunden();

  res.json({
    llm: {
      provider: llmWert.provider ?? "dummy",
      modell: llmWert.modell ?? "",
      endpoint: llmWert.endpoint ?? "",
      // Niemals den Key zuruecksenden – nur ob einer gesetzt ist.
      apiKeyGesetzt: Boolean(llmWert.apiKeyVerschluesselt),
    },
    workflow: {
      modus: workflowWert.modus ?? "immer_manuell",
      konfidenzSchwelle: workflowWert.konfidenzSchwelle ?? 0.8,
    },
    vollzeit: {
      // Referenz-Wochenstunden, die 100 % entsprechen.
      stunden: vollzeitStunden,
    },
  });
});

// ---------------------------------------------------------------------------
// PUT /api/admin/llm  – LLM-Provider konfigurieren
// ---------------------------------------------------------------------------
const llmSchema = z.object({
  provider: z.enum(["anthropic", "openai", "ollama", "dummy"]),
  modell: z.string().optional(),
  endpoint: z.string().optional(),
  // Leerer String = Key nicht aendern; nicht-leer = neuen Key setzen.
  apiKey: z.string().optional(),
});

adminRouter.put("/llm", async (req: AuthRequest, res: Response) => {
  const parse = llmSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const d = parse.data;

  // Endpoint-URL pruefen (nur http/https, keine Zugangsdaten/Query, ggf.
  // Host-Allowlist) – der Server ruft sie spaeter selbst auf.
  if (d.endpoint && d.endpoint.trim() && !ollamaBasisUrl(d.endpoint)) {
    res.status(400).json({
      fehler:
        "Ungültige Endpoint-URL. Erlaubt ist z. B. http://localhost:11434 (ohne Zugangsdaten oder Parameter).",
    });
    return;
  }

  // Bestehenden Wert laden, um den Key ggf. zu behalten.
  const vorhanden = await prisma.einstellung.findUnique({
    where: { schluessel: LLM_SCHLUESSEL },
  });
  const alterWert = (vorhanden?.wert as Record<string, unknown>) ?? {};

  const neuerWert: Record<string, unknown> = {
    provider: d.provider,
    modell: d.modell ?? "",
    endpoint: d.endpoint ?? "",
    apiKeyVerschluesselt: alterWert.apiKeyVerschluesselt ?? null,
  };

  // Nur wenn ein neuer (nicht-leerer) Key kommt, verschluesseln und ersetzen.
  if (d.apiKey && d.apiKey.trim().length > 0) {
    neuerWert.apiKeyVerschluesselt = verschluesseln(d.apiKey.trim());
  }

  await prisma.einstellung.upsert({
    where: { schluessel: LLM_SCHLUESSEL },
    update: { wert: neuerWert as object },
    create: { schluessel: LLM_SCHLUESSEL, wert: neuerWert as object },
  });

  await auditLog({
    userId: req.benutzer?.userId,
    aktion: "ADMIN_LLM_KONFIGURIERT",
    details: { provider: d.provider, modell: d.modell },
  });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PUT /api/admin/workflow  – Bestaetigungs-Modus konfigurieren
// ---------------------------------------------------------------------------
const workflowSchema = z.object({
  modus: z.enum(["immer_manuell", "automatisch", "ab_konfidenz"]),
  konfidenzSchwelle: z.number().min(0).max(1).optional(),
});

adminRouter.put("/workflow", async (req: AuthRequest, res: Response) => {
  const parse = workflowSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const d = parse.data;

  const wert = {
    modus: d.modus,
    konfidenzSchwelle: d.konfidenzSchwelle ?? 0.8,
  };

  await prisma.einstellung.upsert({
    where: { schluessel: WORKFLOW_SCHLUESSEL },
    update: { wert },
    create: { schluessel: WORKFLOW_SCHLUESSEL, wert },
  });

  await auditLog({
    userId: req.benutzer?.userId,
    aktion: "ADMIN_WORKFLOW_KONFIGURIERT",
    details: wert,
  });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PUT /api/admin/vollzeit  – Referenz-Wochenstunden (= 100 %) festlegen
// Fliesst in die KI-Umrechnung Stunden <-> Prozent ein.
// ---------------------------------------------------------------------------
const vollzeitSchema = z.object({
  // Plausibler Bereich fuer eine Vollzeit-Woche (z. B. 38,5 / 40).
  stunden: z.number().positive().max(60),
});

adminRouter.put("/vollzeit", async (req: AuthRequest, res: Response) => {
  const parse = vollzeitSchema.safeParse(req.body);
  if (!parse.success) {
    res
      .status(400)
      .json({ fehler: "Bitte eine gültige Stundenzahl (1–60) angeben." });
    return;
  }

  const wert = { vollzeitStunden: parse.data.stunden };

  await prisma.einstellung.upsert({
    where: { schluessel: VOLLZEIT_SCHLUESSEL },
    update: { wert },
    create: { schluessel: VOLLZEIT_SCHLUESSEL, wert },
  });

  await auditLog({
    userId: req.benutzer?.userId,
    aktion: "ADMIN_VOLLZEIT_KONFIGURIERT",
    details: wert,
  });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Ollama-Installation auf dem Server (nur admin – der Router erzwingt das).
// ---------------------------------------------------------------------------

// GET /api/admin/ollama/status  – ist Ollama installiert/gestartet?
adminRouter.get("/ollama/status", async (_req: AuthRequest, res: Response) => {
  res.json(await ollamaStatus());
});

// POST /api/admin/ollama/install  – Installation auf dem Server anstossen.
adminRouter.post(
  "/ollama/install",
  async (req: AuthRequest, res: Response) => {
    const status = await ollamaStatus();
    if (status.installiert) {
      res.status(409).json({ fehler: "Ollama ist bereits installiert." });
      return;
    }

    const ergebnis = installStarten();
    if (!ergebnis.ok) {
      res.status(409).json({ fehler: ergebnis.grund });
      return;
    }

    await auditLog({
      userId: req.benutzer?.userId,
      aktion: "ADMIN_OLLAMA_INSTALL_GESTARTET",
      details: { plattform: status.plattform },
    });

    res.json({ gestartet: true });
  }
);

// ---------------------------------------------------------------------------
// Hinweis Benutzerverwaltung: Benutzer, Rollen und Zugriff auf dieses Tool
// werden seit der Suite-Integration zentral in der OEHTB-Suite-Verwaltung
// gepflegt (Portal -> Verwaltung). Hier gibt es dafuer keine Routen mehr.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /api/admin/audit  – AuditLog ansehen (DSGVO-Nachweis)
// Optional ?mitarbeiterId=... filtert auf eine Person.
// Liefert die juengsten Eintraege (max. 200). Loest User- und
// Mitarbeiter-IDs fuer die Anzeige in lesbare Namen auf.
// ---------------------------------------------------------------------------
adminRouter.get("/audit", async (req: AuthRequest, res: Response) => {
  const mitarbeiterId =
    typeof req.query.mitarbeiterId === "string"
      ? req.query.mitarbeiterId
      : undefined;

  const eintraege = await prisma.auditLog.findMany({
    where: mitarbeiterId ? { betroffenerMitarbeiterId: mitarbeiterId } : undefined,
    orderBy: { zeitpunkt: "desc" },
    take: 200,
  });

  // IDs einmalig sammeln und in Namen aufloesen (fuer die Anzeige).
  const userIds = Array.from(
    new Set(eintraege.map((e) => e.userId).filter((x): x is string => Boolean(x)))
  );
  const maIds = Array.from(
    new Set(
      eintraege
        .map((e) => e.betroffenerMitarbeiterId)
        .filter((x): x is string => Boolean(x))
    )
  );

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  });
  const mitarbeiter = await prisma.mitarbeiter.findMany({
    where: { id: { in: maIds } },
    select: { id: true, vorname: true, nachname: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  const maMap = new Map(
    mitarbeiter.map((m) => [m.id, `${m.nachname}, ${m.vorname}`])
  );

  res.json(
    eintraege.map((e) => ({
      id: e.id,
      zeitpunkt: e.zeitpunkt,
      aktion: e.aktion,
      benutzer: e.userId ? userMap.get(e.userId) ?? "(unbekannt)" : null,
      betroffenerMitarbeiter: e.betroffenerMitarbeiterId
        ? maMap.get(e.betroffenerMitarbeiterId) ?? "(geloescht)"
        : null,
      details: e.details,
    }))
  );
});

// ---------------------------------------------------------------------------
// IMAP-Konfiguration und manueller Abruf
// ---------------------------------------------------------------------------

// GET /api/admin/imap  – aktuelle IMAP-Konfiguration (ohne Klartext-Passwort)
adminRouter.get("/imap", async (_req: AuthRequest, res: Response) => {
  const konfig = await ladeImapKonfig();
  res.json({
    aktiv: konfig?.aktiv ?? false,
    host: konfig?.host ?? "",
    port: konfig?.port ?? 993,
    secure: konfig?.secure ?? true,
    benutzer: konfig?.benutzer ?? "",
    intervallMinuten: konfig?.intervallMinuten ?? 15,
    passwortGesetzt: Boolean(konfig?.passwort),
  });
});

// PUT /api/admin/imap  – IMAP-Konfiguration speichern
const imapSchema = z.object({
  aktiv: z.boolean(),
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  benutzer: z.string(),
  intervallMinuten: z.number().int().min(1).max(1440),
  // Leer = Passwort beibehalten; nicht-leer = neues Passwort setzen.
  passwort: z.string().optional(),
});

adminRouter.put("/imap", async (req: AuthRequest, res: Response) => {
  const parse = imapSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ung\u00fcltige IMAP-Eingabe." });
    return;
  }
  const d = parse.data;

  const vorhanden = await prisma.einstellung.findUnique({
    where: { schluessel: IMAP_SCHLUESSEL },
  });
  const alt = (vorhanden?.wert as Record<string, unknown>) ?? {};

  const neuerWert: Record<string, unknown> = {
    aktiv: d.aktiv,
    host: d.host,
    port: d.port,
    secure: d.secure,
    benutzer: d.benutzer,
    intervallMinuten: d.intervallMinuten,
    passwortVerschluesselt: alt.passwortVerschluesselt ?? null,
  };

  if (d.passwort && d.passwort.trim().length > 0) {
    neuerWert.passwortVerschluesselt = verschluesseln(d.passwort.trim());
  }

  await prisma.einstellung.upsert({
    where: { schluessel: IMAP_SCHLUESSEL },
    update: { wert: neuerWert as object },
    create: { schluessel: IMAP_SCHLUESSEL, wert: neuerWert as object },
  });

  await auditLog({
    userId: req.benutzer?.userId,
    aktion: "ADMIN_IMAP_KONFIGURIERT",
    details: { host: d.host, aktiv: d.aktiv },
  });

  res.json({ ok: true });
});

// POST /api/admin/imap/abrufen  – manueller Sofort-Abruf
adminRouter.post("/imap/abrufen", async (req: AuthRequest, res: Response) => {
  const ergebnis = await imapAbrufen();
  await auditLog({
    userId: req.benutzer?.userId,
    aktion: "ADMIN_IMAP_MANUELLER_ABRUF",
    details: { abgerufen: ergebnis.abgerufen, fehler: ergebnis.fehler },
  });
  res.json(ergebnis);
});

// ---------------------------------------------------------------------------
// Erlaubte Absender (Whitelist fuer IMAP-Mails)
// ---------------------------------------------------------------------------

// GET /api/admin/absender  – Liste erlaubter Absender-Adressen
adminRouter.get("/absender", async (_req: AuthRequest, res: Response) => {
  const adressen = await ladeErlaubteAbsender();
  res.json({ adressen });
});

// PUT /api/admin/absender  – Liste erlaubter Absender-Adressen speichern
const absenderSchema = z.object({
  adressen: z.array(z.string()),
});

adminRouter.put("/absender", async (req: AuthRequest, res: Response) => {
  const parse = absenderSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ung\u00fcltige Eingabe." });
    return;
  }

  // Adressen normalisieren: trimmen, klein, leere und Duplikate entfernen,
  // nur plausible E-Mail-Adressen behalten.
  const sauber = Array.from(
    new Set(
      parse.data.adressen
        .map((a) => a.trim().toLowerCase())
        .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))
    )
  );

  await prisma.einstellung.upsert({
    where: { schluessel: ABSENDER_SCHLUESSEL },
    update: { wert: { adressen: sauber } },
    create: { schluessel: ABSENDER_SCHLUESSEL, wert: { adressen: sauber } },
  });

  await auditLog({
    userId: req.benutzer?.userId,
    aktion: "ADMIN_ERLAUBTE_ABSENDER_GEAENDERT",
    details: { anzahl: sauber.length },
  });

  res.json({ adressen: sauber });
});
