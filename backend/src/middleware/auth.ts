import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import {
  SUITE_COOKIE,
  SuiteToken,
  TIMEOUT_MINUTEN,
  tokenLoeschen,
  tokenPruefen,
  tokenSetzen,
  tokenSignieren,
} from "../lib/auth";

export interface AuthRequest extends Request {
  benutzer?: SuiteToken;
}

// Baut die Zugriff-Claims eines Benutzers frisch aus der DB.
export async function zugriffeLaden(
  userId: string
): Promise<Record<string, string>> {
  const zugriffe = await prisma.zugriff.findMany({
    where: { userId, tool: { aktiv: true } },
    include: { tool: { select: { slug: true } } },
  });
  const claims: Record<string, string> = {};
  for (const z of zugriffe) claims[z.tool.slug] = z.rolle;
  return claims;
}

// Middleware: Suite-Token pruefen, Inaktivitaets-Timeout erzwingen, Rechte
// bei jeder Anfrage FRISCH aus der Suite-DB laden (das Portal ist die
// Quelle der Wahrheit; hier ist die DB lokal, also guenstig) und das Token
// gleitend erneuern.
export async function angemeldet(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.[SUITE_COOKIE];
  if (!token) {
    res.status(401).json({ fehler: "Nicht angemeldet." });
    return;
  }

  try {
    const roh = tokenPruefen(token);

    if (Date.now() - roh.letzteAktivitaet > TIMEOUT_MINUTEN * 60 * 1000) {
      tokenLoeschen(res);
      res.status(401).json({ fehler: "Sitzung abgelaufen (Inaktivität)." });
      return;
    }

    // Benutzer + Rechte frisch lesen: Deaktivierung/Entzug wirkt sofort.
    const user = await prisma.suiteUser.findUnique({
      where: { id: roh.sub },
    });
    if (!user || !user.aktiv) {
      tokenLoeschen(res);
      res.status(401).json({ fehler: "Benutzer nicht (mehr) aktiv." });
      return;
    }
    const zugriff = await zugriffeLaden(user.id);

    const frisch: SuiteToken = {
      sub: user.id,
      benutzername: user.benutzername,
      name: user.name,
      zugriff,
      letzteAktivitaet: Date.now(),
      geprueftAm: Date.now(),
    };
    tokenSetzen(res, tokenSignieren(frisch));

    req.benutzer = frisch;
    next();
  } catch {
    res.status(401).json({ fehler: "Ungültige Sitzung." });
  }
}

// Nur Benutzer mit Verwaltungs-Zugriff in der angegebenen Rolle.
export function verwaltungPflicht(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.benutzer?.zugriff["verwaltung"] !== "admin") {
    res.status(403).json({ fehler: "Keine Berechtigung für die Verwaltung." });
    return;
  }
  next();
}
