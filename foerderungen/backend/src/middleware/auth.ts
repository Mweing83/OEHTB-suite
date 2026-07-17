import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import {
  SUITE_COOKIE,
  SuiteToken,
  TOOL_SLUG,
  cookieOptionen,
  pruefungIstAbgelaufen,
  suiteRefresh,
  tokenPruefen,
  tokenSignieren,
} from "../lib/suiteAuth";

// ---------------------------------------------------------------------------
// SSO-Middleware (OEHTB-Suite).
//
// Das Login liegt seit der Suite-Integration NICHT mehr in diesem Tool,
// sondern zentral im Suite-Portal. Diese Middleware verifiziert nur noch
// das gemeinsame Suite-Token und prueft, ob der Zugriff fuer DIESES Tool
// (aus token.zugriff["foerderungen"]) freigeschaltet ist.
//
// Das Foerderungen-Tool kennt nur EINE Rolle (nutzer) – es gibt daher keine
// Rollenpruefung mehr (kein rollePflicht wie bei stunden).
// ---------------------------------------------------------------------------

export type Rolle = "nutzer";
const GUELTIGE_ROLLEN = ["nutzer"]; // Wert im Suite-Token (Registry-Schreibweise)

export interface TokenInhalt {
  userId: string;
  rolle: Rolle;
  letzteAktivitaet: number;
}

export interface AuthRequest extends Request {
  benutzer?: TokenInhalt;
}

const TIMEOUT_MINUTEN = Number(process.env.SESSION_TIMEOUT_MINUTEN ?? 15);

// Stellt sicher, dass es zu diesem Suite-Benutzer eine LOKALE User-Zeile gibt
// (fuer erfasstVon-/Audit-Referenzen und die Namensauflaesung). Legt sie bei
// Bedarf an und haelt den Namen synchron. Liefert die LOKALE User-ID.
async function lokalenBenutzerSichern(token: SuiteToken): Promise<string> {
  const vorhanden = await prisma.user.findUnique({
    where: { suiteUserId: token.sub },
  });
  if (!vorhanden) {
    const neu = await prisma.user.create({
      data: {
        suiteUserId: token.sub,
        // E-Mail kommt aus der zentralen Provisionierung (kann leer sein);
        // der fruehere synthetische "@suite.local"-Platzhalter entfaellt.
        email: null,
        name: token.name,
        aktiv: true,
      },
    });
    return neu.id;
  }
  // Name bei Bedarf nachziehen.
  if (vorhanden.name !== token.name) {
    await prisma.user.update({
      where: { id: vorhanden.id },
      data: { name: token.name },
    });
  }
  return vorhanden.id;
}

export async function authPflicht(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.[SUITE_COOKIE];
  if (!token) {
    res.status(401).json({ fehler: "Nicht angemeldet." });
    return;
  }

  let inhalt;
  try {
    inhalt = tokenPruefen(token);
  } catch {
    res.status(401).json({ fehler: "Ungültige Sitzung." });
    return;
  }

  if (Date.now() - inhalt.letzteAktivitaet > TIMEOUT_MINUTEN * 60 * 1000) {
    res.clearCookie(SUITE_COOKIE, { path: "/" });
    res.status(401).json({ fehler: "Sitzung abgelaufen (Inaktivität)." });
    return;
  }

  // Rechte zu alt? Beim Portal auffrischen (Rollenaenderung/Entzug wirkt so
  // zeitnah). Schlaegt das fehl, wird mit dem aktuellen Stand weitergemacht.
  if (pruefungIstAbgelaufen(inhalt)) {
    const frisch = await suiteRefresh(token);
    if (frisch) inhalt = frisch;
  }

  const rolleRoh = inhalt.zugriff[TOOL_SLUG];
  if (!rolleRoh || !GUELTIGE_ROLLEN.includes(rolleRoh)) {
    res.status(403).json({ fehler: "Kein Zugriff auf dieses Tool." });
    return;
  }

  // Token gleitend erneuern (Aktivitaet), gleiche Rechte-Pruefzeit behalten.
  const neuesToken = tokenSignieren({
    ...inhalt,
    letzteAktivitaet: Date.now(),
  });
  res.cookie(SUITE_COOKIE, neuesToken, cookieOptionen());

  // Lokale User-Zeile sicherstellen; userId = LOKALE ID (fuer erfasstVon/Audit).
  const lokaleId = await lokalenBenutzerSichern(inhalt);

  // Zentrale Provisionierung ist massgeblich: zentral deaktivierte oder
  // geloeschte Benutzer werden gesperrt, auch wenn das Token noch Zugriff traegt.
  const lokal = await prisma.user.findUnique({ where: { id: lokaleId } });
  if (!lokal || !lokal.aktiv || lokal.geloescht) {
    res.status(403).json({ fehler: "Zugang zu diesem Tool wurde entzogen." });
    return;
  }

  req.benutzer = {
    userId: lokaleId,
    rolle: "nutzer",
    letzteAktivitaet: Date.now(),
  };
  next();
}
