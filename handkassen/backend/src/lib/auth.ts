import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "bitte-aendern";

// Sicherheitsnetz: Im Produktivbetrieb darf NICHT mit einem Platzhalter oder einem
// zu kurzen Secret gestartet werden (sonst sind Tokens fälschbar). Lieber sofort
// abbrechen als unsicher laufen.
const istPlatzhalter = /bitte|ersetzen|aendern|changeme|example|platzhalter/i.test(JWT_SECRET);
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || istPlatzhalter || process.env.JWT_SECRET.length < 32)
) {
  throw new Error(
    "JWT_SECRET fehlt oder ist unsicher. Bitte in der Server-Umgebung einen langen Zufallswert (>= 32 Zeichen) setzen."
  );
}

export interface TokenInhalt {
  id: number;
  benutzername: string;
  rolle: string;
}

export async function passwortHashen(klartext: string): Promise<string> {
  return bcrypt.hash(klartext, 10);
}

export async function passwortPruefen(
  klartext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(klartext, hash);
}

export function tokenErstellen(inhalt: TokenInhalt): string {
  // 15 Minuten Laufzeit. Wird bei jeder Aktivität erneuert (gleitendes Fenster),
  // sodass nur echte Inaktivität zum Ablauf führt.
  return jwt.sign(inhalt, JWT_SECRET, { expiresIn: "15m" });
}

export function tokenPruefen(token: string): TokenInhalt {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as TokenInhalt;
}

// Zentrale Cookie-Optionen für das Anmelde-Token (an EINER Stelle definiert,
// damit Login und Middleware identisch sind).
// `secure` (nur über HTTPS) ist im Produktivbetrieb Standard. Für einen reinen
// HTTP-Betrieb im internen Netz kann es mit COOKIE_INSECURE=1 abgeschaltet werden.
// ACHTUNG: Ohne HTTPS laufen Anmeldedaten unverschlüsselt – nur in einem
// vertrauenswürdigen, abgeschotteten Netz vertretbar.
export function cookieOptionen(): CookieOptions {
  const secure = process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE !== "1";
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
  };
}
