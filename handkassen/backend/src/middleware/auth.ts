import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/db.js";
import type { TokenInhalt } from "../lib/auth.js";
import {
  SUITE_COOKIE,
  TOOL_SLUG,
  cookieOptionen,
  pruefungIstAbgelaufen,
  suiteRefresh,
  tokenPruefen,
  tokenSignieren,
  tokenIstAbsolutAbgelaufen,
  type SuiteToken,
} from "../lib/suiteAuth.js";
import { altzeileUebernehmen } from "../lib/altzeile.js";

// ---------------------------------------------------------------------------
// SSO-Middleware (OEHTB-Suite).
//
// Das Login liegt seit der Suite-Integration zentral im Portal. Diese
// Middleware verifiziert nur noch das gemeinsame Suite-Token und leitet die
// fuer DIESES Tool geltende Rolle aus token.zugriff["handkassen"] ab.
//
// WICHTIG: Handkassen hat ECHTE FK-Relationen auf Benutzer.id (Int). Daher
// wird beim ersten Zugriff eine LOKALE Benutzer-Zeile provisioniert (bzw. eine
// bereits vorhandene, gleichnamige verknuepft) und req.benutzer.id auf DIESE
// lokale Int-ID gesetzt. Form von TokenInhalt/req.benutzer bleibt unveraendert
// (id:Int, benutzername, rolle) – rolleErforderlich/darfKostenstelle und alle
// Routen funktionieren dadurch weiter.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      benutzer?: TokenInhalt;
    }
  }
}

const GUELTIGE_ROLLEN = ["erfasser", "leitung", "finanzen", "admin"] as const;
type HkRolle = (typeof GUELTIGE_ROLLEN)[number];
const TIMEOUT_MINUTEN = Number(process.env.SESSION_TIMEOUT_MINUTEN ?? 15);

// Stellt eine lokale Benutzer-Zeile fuer diesen Suite-Benutzer sicher und
// liefert deren Int-ID. Verknuepft bei Bedarf einen gleichnamigen Bestands-
// nutzer (ohne dessen Kostenstellen-Freischaltungen, siehe lib/altzeile.ts)
// und haelt Name/Rolle synchron.
async function lokalenBenutzerSichern(
  token: SuiteToken,
  rolle: HkRolle
): Promise<number> {
  const b = await prisma.benutzer.findUnique({ where: { suiteUserId: token.sub } });
  if (b) {
    if (b.name !== token.name || b.rolle !== rolle) {
      await prisma.benutzer.update({
        where: { id: b.id },
        data: { name: token.name, rolle },
      });
    }
    return b.id;
  }

  // Noch nicht verknuepft: evtl. existiert ein gleichnamiger Bestandsnutzer.
  const gleich = await prisma.benutzer.findUnique({
    where: { benutzername: token.benutzername },
  });
  if (gleich && !gleich.suiteUserId) {
    // Freischaltungen werden dabei entfernt und die Uebernahme protokolliert
    // (siehe lib/altzeile.ts).
    await altzeileUebernehmen(
      gleich,
      { suiteUserId: token.sub, name: token.name, rolle, aktiv: true },
      "anmeldung"
    );
    return gleich.id;
  }

  const neu = await prisma.benutzer.create({
    data: {
      suiteUserId: token.sub,
      benutzername: token.benutzername,
      name: token.name,
      rolle,
      passwortSetzen: false, // Login liegt im Portal
      aktiv: true,
    },
  });
  return neu.id;
}

export async function angemeldet(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.cookies?.[SUITE_COOKIE];
  if (!token) return res.status(401).json({ fehler: "Nicht angemeldet." });

  let inhalt: SuiteToken;
  try {
    inhalt = tokenPruefen(token);
  } catch {
    return res.status(401).json({ fehler: "Sitzung ungültig oder abgelaufen." });
  }

  if (Date.now() - inhalt.letzteAktivitaet > TIMEOUT_MINUTEN * 60 * 1000) {
    res.clearCookie(SUITE_COOKIE, { path: "/" });
    return res.status(401).json({ fehler: "Sitzung abgelaufen (Inaktivität)." });
  }
  if (tokenIstAbsolutAbgelaufen(inhalt)) {
    res.clearCookie(SUITE_COOKIE, { path: "/" });
    return res.status(401).json({ fehler: "Sitzung abgelaufen. Bitte neu anmelden." });
  }

  // Rechte zu alt? Beim Portal auffrischen. Lehnt das Portal verbindlich ab
  // (geloescht/inaktiv), endet die Sitzung; ist es nur nicht erreichbar, geht
  // es mit dem bisherigen Stand weiter (bekannte Benutzer bleiben arbeitsfaehig).
  let bestaetigt = !pruefungIstAbgelaufen(inhalt);
  if (!bestaetigt) {
    const frisch = await suiteRefresh(token);
    if (frisch === "widerrufen") {
      res.clearCookie(SUITE_COOKIE, { path: "/" });
      return res.status(401).json({ fehler: "Sitzung beendet: Zugang wurde zentral entzogen." });
    }
    if (frisch) {
      inhalt = frisch;
      bestaetigt = true;
    }
  }

  const rolleRoh = inhalt.zugriff[TOOL_SLUG];
  if (!rolleRoh || !GUELTIGE_ROLLEN.includes(rolleRoh as HkRolle)) {
    return res.status(403).json({ fehler: "Kein Zugriff auf dieses Tool." });
  }
  const rolle = rolleRoh as HkRolle;

  // Unbekannte Benutzer nur anlegen/verknuepfen, wenn das Portal die Rechte
  // in dieser Anfrage bestaetigt hat – nie allein aus alten Token-Claims.
  if (!bestaetigt) {
    const bekannt = await prisma.benutzer.findUnique({ where: { suiteUserId: inhalt.sub } });
    if (!bekannt) {
      return res.status(403).json({
        fehler: "Zugang kann gerade nicht bestätigt werden. Bitte später erneut versuchen.",
      });
    }
  }

  const lokaleId = await lokalenBenutzerSichern(inhalt, rolle);

  // Zentrale Provisionierung ist massgeblich: zentral deaktivierte oder
  // geloeschte Benutzer werden gesperrt, auch wenn das Token noch Zugriff traegt.
  const lokal = await prisma.benutzer.findUnique({ where: { id: lokaleId } });
  if (!lokal || !lokal.aktiv || lokal.geloescht) {
    return res.status(403).json({ fehler: "Zugang zu diesem Tool wurde entzogen." });
  }

  req.benutzer = {
    id: lokaleId,
    benutzername: inhalt.benutzername,
    rolle,
  };

  // Gleitendes Fenster: bei jeder gueltigen Anfrage frisches Token setzen.
  const neuerToken = tokenSignieren({ ...inhalt, letzteAktivitaet: Date.now() });
  res.cookie(SUITE_COOKIE, neuerToken, cookieOptionen());

  next();
}

export function rolleErforderlich(...rollen: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.benutzer || !rollen.includes(req.benutzer.rolle)) {
      return res.status(403).json({ fehler: "Keine Berechtigung." });
    }
    next();
  };
}

// Unveraendert: admin/finanzen sehen alle Kostenstellen, sonst nur
// zugeordnete (benutzer_kostenstelle, lokale Int-ID).
export async function darfKostenstelle(
  benutzer: TokenInhalt,
  kostenstelleId: number
): Promise<boolean> {
  if (benutzer.rolle === "admin" || benutzer.rolle === "finanzen") return true;
  const zuordnung = await prisma.benutzerKostenstelle.findUnique({
    where: {
      benutzerId_kostenstelleId: {
        benutzerId: benutzer.id,
        kostenstelleId,
      },
    },
  });
  return zuordnung !== null;
}
