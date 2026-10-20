import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { CookieOptions, Response } from "express";

// ---------------------------------------------------------------------------
// Suite-weites SSO-Token.
//
// EIN Cookie ("suite_token", Path=/) fuer Portal und alle Tools unter einer
// Domain. Alle Backends teilen sich JWT_SECRET und verifizieren das Token
// selbst; die Tools lesen ihre Rolle aus "zugriff[<toolSlug>]".
//
// "geprueftAm": Zeitpunkt, zu dem die Zugriffsrechte zuletzt gegen die
// Suite-DB geprueft wurden. Tools erneuern das Token selbst (Aktivitaet),
// holen aber nach Ablauf von PRUEF_INTERVALL_MS einen frischen Stand ueber
// POST /api/suite/auth/refresh – so wirken Rechteaenderungen binnen ~1 Minute.
// ---------------------------------------------------------------------------

export const SUITE_COOKIE = "suite_token";
export const PRUEF_INTERVALL_MS = 60 * 1000;

export interface SuiteToken {
  sub: string; // SuiteUser.id
  benutzername: string;
  name: string;
  zugriff: Record<string, string>; // toolSlug -> Rolle
  letzteAktivitaet: number; // ms, fuer Inaktivitaets-Timeout
  geprueftAm: number; // ms, letzte Rechte-Pruefung gegen die Suite-DB
  // ms, Zeitpunkt der Anmeldung. Wird beim gleitenden Erneuern NICHT
  // zurueckgesetzt -> absolute Hoechstdauer einer Sitzung.
  authTime: number;
  // Muss SuiteUser.tokenGeneration entsprechen (Passwortwechsel/Logout
  // erhoehen sie und machen damit alle aelteren Tokens ungueltig).
  tokenGeneration: number;
}

export const TIMEOUT_MINUTEN = Number(process.env.SESSION_TIMEOUT_MINUTEN ?? 15);
export const ABSOLUT_MAX_MS =
  Number(process.env.SESSION_ABSOLUT_STUNDEN ?? 12) * 60 * 60 * 1000;

// Absolute Sitzungsdauer ueberschritten (oder Altbestand ohne authTime)?
export function tokenIstAbsolutAbgelaufen(t: SuiteToken): boolean {
  return typeof t.authTime !== "number" || Date.now() - t.authTime > ABSOLUT_MAX_MS;
}

// JWT_SECRET mit Produktionsguard (Muster Handkassen).
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? "";
  const istPlatzhalter = /bitte|ersetzen|aendern|changeme|example|platzhalter/i.test(secret);
  if (process.env.NODE_ENV === "production") {
    if (!secret || istPlatzhalter || secret.length < 32) {
      throw new Error(
        "JWT_SECRET fehlt, ist zu kurz (min. 32 Zeichen) oder noch ein Platzhalter. In .env setzen."
      );
    }
  }
  return secret || "dev-secret";
}

export function cookieOptionen(): CookieOptions {
  const secure =
    process.env.NODE_ENV === "production" &&
    process.env.COOKIE_INSECURE !== "1";
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/", // wichtig: gilt fuer /handkassen und /stunden mit
    // Kein maxAge => Session-Cookie (Browser zu = abgemeldet)
  };
}

export function tokenSignieren(
  inhalt: Omit<SuiteToken, "letzteAktivitaet" | "geprueftAm" | "authTime"> &
    Partial<Pick<SuiteToken, "letzteAktivitaet" | "geprueftAm" | "authTime">>
): string {
  const jetzt = Date.now();
  const payload: SuiteToken = {
    sub: inhalt.sub,
    benutzername: inhalt.benutzername,
    name: inhalt.name,
    zugriff: inhalt.zugriff,
    letzteAktivitaet: inhalt.letzteAktivitaet ?? jetzt,
    geprueftAm: inhalt.geprueftAm ?? jetzt,
    authTime: inhalt.authTime ?? jetzt,
    tokenGeneration: inhalt.tokenGeneration,
  };
  // Ablauf nie ueber die absolute Hoechstdauer ab Anmeldung hinaus.
  const restSek = Math.max(1, Math.floor((payload.authTime + ABSOLUT_MAX_MS - jetzt) / 1000));
  return jwt.sign(payload, jwtSecret(), { expiresIn: restSek });
}

export function tokenPruefen(token: string): SuiteToken {
  const roh = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] }) as SuiteToken;
  return {
    sub: roh.sub,
    benutzername: roh.benutzername,
    name: roh.name,
    zugriff: roh.zugriff ?? {},
    letzteAktivitaet: roh.letzteAktivitaet,
    geprueftAm: roh.geprueftAm,
    authTime: roh.authTime,
    tokenGeneration: roh.tokenGeneration,
  };
}

export function tokenSetzen(res: Response, token: string): void {
  res.cookie(SUITE_COOKIE, token, cookieOptionen());
}

export function tokenLoeschen(res: Response): void {
  res.clearCookie(SUITE_COOKIE, { path: "/" });
}

export function passwortHashen(passwort: string): Promise<string> {
  return bcrypt.hash(passwort, 10);
}

export function passwortPruefen(
  passwort: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(passwort, hash);
}
