import { Router } from "express";
import { prisma } from "../lib/db.js";
import { angemeldet } from "../middleware/auth.js";
import { SUITE_COOKIE } from "../lib/suiteAuth.js";

// Login/Logout/Passwort liegen seit der Suite-Integration zentral im Portal.
// Dieses Tool bietet nur noch einen leichten Sitzungs-Endpunkt (/me) und ein
// lokales Cookie-Loeschen (/logout, best effort) fuer das Frontend.
export const authRouter = Router();

authRouter.get("/me", angemeldet, async (req, res) => {
  const benutzer = await prisma.benutzer.findUnique({
    where: { id: req.benutzer!.id },
    select: { id: true, name: true, benutzername: true, rolle: true },
  });
  if (!benutzer) return res.status(401).json({ fehler: "Benutzer nicht gefunden." });
  res.json(benutzer);
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SUITE_COOKIE, { path: "/" }).json({ ok: true });
});
