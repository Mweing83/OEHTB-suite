import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest, authPflicht } from "../middleware/auth";

// Leichter Sitzungs-Endpunkt fuer das Frontend. Bestaetigt ueber die
// SSO-Middleware, dass eine gueltige Suite-Sitzung MIT Zugriff auf dieses
// Tool besteht, und liefert die fuer dieses Tool geltende Rolle. Das
// eigentliche Login/Logout liegt im Suite-Portal.
export const sitzungRouter = Router();

sitzungRouter.get("/me", authPflicht, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.benutzer!.userId },
    select: { id: true, email: true, name: true, rolle: true },
  });
  if (!user) {
    res.status(401).json({ fehler: "Benutzer nicht gefunden." });
    return;
  }
  res.json(user);
});
