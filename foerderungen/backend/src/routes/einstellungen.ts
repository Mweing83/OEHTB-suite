import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { verschluesseln } from "../lib/krypto";
import { auditLog } from "../lib/audit";
import { LLM_SCHLUESSEL, SCAN_SCHLUESSEL } from "../lib/konstanten";
import { AuthRequest, authPflicht } from "../middleware/auth";
import { aktualisiereZeitplan, ladeScanKonfig } from "../services/zeitplan";

// Konfiguration nach dem Muster des Stunden-Admin-Tabs: Key-Value-Zeilen in
// der Einstellung-Tabelle, API-Key AES-verschluesselt at rest, nie im
// Klartext in einer Antwort.
export const einstellungenRouter = Router();
einstellungenRouter.use(authPflicht);

einstellungenRouter.get("/", async (_req: AuthRequest, res: Response) => {
  const llm = await prisma.einstellung.findUnique({
    where: { schluessel: LLM_SCHLUESSEL },
  });
  const llmWert = (llm?.wert as Record<string, unknown>) ?? {};
  res.json({
    llm: {
      provider: llmWert.provider ?? "dummy",
      modell: llmWert.modell ?? "",
      apiKeyGesetzt: Boolean(llmWert.apiKeyVerschluesselt),
      // Fuer welchen Anbieter der Key eingegeben wurde (Altbestand: aktueller).
      apiKeyAnbieter: llmWert.apiKeyVerschluesselt
        ? ((llmWert.apiKeyProvider as string | undefined) ?? llmWert.provider ?? null)
        : null,
    },
    // ladeScanKonfig versteht auch das alte flache Format (Migration).
    scan: await ladeScanKonfig(),
  });
});

const llmSchema = z.object({
  provider: z.enum(["anthropic", "openai", "dummy"]),
  modell: z.string().max(100).optional(),
  apiKey: z.string().max(500).optional(),
  // true = gespeicherten Key ausdruecklich loeschen.
  apiKeyLoeschen: z.boolean().optional(),
});

einstellungenRouter.put("/llm", async (req: AuthRequest, res: Response) => {
  const parse = llmSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const d = parse.data;
  const alt = await prisma.einstellung.findUnique({ where: { schluessel: LLM_SCHLUESSEL } });
  const alterWert = (alt?.wert as Record<string, unknown>) ?? {};
  // Ein Key gehoert zu genau einem Anbieter. Wechselt der Anbieter ohne neuen
  // Key, wird der alte verworfen – sonst ginge z. B. der Anthropic-Key an
  // OpenAI (Security-Audit 2026-10). Altbestand ohne apiKeyProvider gilt als
  // Key des bisher eingestellten Anbieters.
  const alterKeyAnbieter =
    (alterWert.apiKeyProvider as string | undefined) ?? (alterWert.provider as string | undefined);
  const neuerKey = d.apiKey && d.apiKey.trim().length > 0 ? d.apiKey.trim() : null;
  const behalten = !d.apiKeyLoeschen && alterKeyAnbieter === d.provider;
  const neuerWert: Record<string, unknown> = {
    provider: d.provider,
    modell: d.modell ?? "",
    apiKeyVerschluesselt: behalten ? (alterWert.apiKeyVerschluesselt ?? null) : null,
    apiKeyProvider: behalten && alterWert.apiKeyVerschluesselt ? d.provider : null,
  };
  if (neuerKey) {
    neuerWert.apiKeyVerschluesselt = verschluesseln(neuerKey);
    neuerWert.apiKeyProvider = d.provider;
  }
  const keyVerworfen = Boolean(alterWert.apiKeyVerschluesselt) && !neuerWert.apiKeyVerschluesselt;
  await prisma.einstellung.upsert({
    where: { schluessel: LLM_SCHLUESSEL },
    update: { wert: neuerWert as object },
    create: { schluessel: LLM_SCHLUESSEL, wert: neuerWert as object },
  });
  await auditLog({
    userId: req.benutzer!.userId,
    aktion: "EINSTELLUNG_LLM",
    details: {
      provider: d.provider,
      modell: d.modell,
      apiKeyGeaendert: Boolean(neuerKey),
      apiKeyVerworfen: keyVerworfen,
    },
  });
  res.json({ ok: true });
});

const scanSchema = z.object({
  ueberwachung: z.object({
    aktiv: z.boolean(),
    wochentag: z.number().int().min(0).max(6),
    stunde: z.number().int().min(0).max(23),
  }),
  entdeckung: z.object({
    aktiv: z.boolean(),
    // Tag des Monats; auf 1-28 begrenzt, damit der Lauf in jedem Monat feuert.
    tag: z.number().int().min(1).max(28),
    stunde: z.number().int().min(0).max(23),
  }),
});

einstellungenRouter.put("/scan", async (req: AuthRequest, res: Response) => {
  const parse = scanSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  await prisma.einstellung.upsert({
    where: { schluessel: SCAN_SCHLUESSEL },
    update: { wert: parse.data },
    create: { schluessel: SCAN_SCHLUESSEL, wert: parse.data },
  });
  await auditLog({ userId: req.benutzer!.userId, aktion: "EINSTELLUNG_SCAN", details: parse.data });
  // Cron-Job an den neuen Zeitplan anpassen.
  await aktualisiereZeitplan();
  res.json({ ok: true });
});
