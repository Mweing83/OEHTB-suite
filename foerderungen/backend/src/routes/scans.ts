import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auditLog } from "../lib/audit";
import { AuthRequest, authPflicht } from "../middleware/auth";
import { fuehreScanAus, scanLaeuft } from "../services/scanner";

// Scan-Verlauf + manueller Start (Ueberwachung ODER Entdeckung getrennt).
// Der Scan laeuft asynchron; die Antwort kommt sofort (202). Hoechstens ein
// Scan gleichzeitig (409), egal welcher Art.
export const scansRouter = Router();
scansRouter.use(authPflicht);

scansRouter.get("/", async (_req: AuthRequest, res: Response) => {
  const laeufe = await prisma.scanLauf.findMany({
    orderBy: { gestartet: "desc" },
    take: 50,
  });
  res.json({ laeuft: scanLaeuft(), laeufe });
});

const startSchema = z.object({
  art: z.enum(["UEBERWACHUNG", "ENTDECKUNG"]),
});

scansRouter.post("/", async (req: AuthRequest, res: Response) => {
  const parse = startSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  if (scanLaeuft()) {
    res.status(409).json({ fehler: "Es läuft bereits ein Scan." });
    return;
  }
  await auditLog({
    userId: req.benutzer!.userId,
    aktion: "SCAN_GESTARTET",
    details: { art: parse.data.art },
  });
  void fuehreScanAus("MANUELL", parse.data.art);
  res.status(202).json({ ok: true });
});
