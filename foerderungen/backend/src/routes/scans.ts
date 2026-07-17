import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { auditLog } from "../lib/audit";
import { AuthRequest, authPflicht } from "../middleware/auth";
import { fuehreScanAus, scanLaeuft } from "../services/scanner";

// Scan-Verlauf + manueller Start. Der Scan laeuft asynchron; die Antwort
// kommt sofort (202). Hoechstens ein Scan gleichzeitig (409).
export const scansRouter = Router();
scansRouter.use(authPflicht);

scansRouter.get("/", async (_req: AuthRequest, res: Response) => {
  const laeufe = await prisma.scanLauf.findMany({
    orderBy: { gestartet: "desc" },
    take: 50,
  });
  res.json({ laeuft: scanLaeuft(), laeufe });
});

scansRouter.post("/", async (req: AuthRequest, res: Response) => {
  if (scanLaeuft()) {
    res.status(409).json({ fehler: "Es läuft bereits ein Scan." });
    return;
  }
  await auditLog({ userId: req.benutzer!.userId, aktion: "SCAN_GESTARTET" });
  void fuehreScanAus("MANUELL");
  res.status(202).json({ ok: true });
});
