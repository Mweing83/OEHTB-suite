import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";

// ---------------------------------------------------------------------------
// SSO-Anbindung an die OEHTB-Suite (siehe Stunden-Tool: gleiches Format).
//
// Login liegt zentral im Suite-Portal, das ein gemeinsames Cookie
// ("suite_token", Path=/) setzt. Alle Tool-Backends verifizieren dasselbe JWT
// mit demselben JWT_SECRET. Dieses Tool leitet seine Rolle aus
// token.zugriff["handkassen"] ab.
//
// Quelle der Wahrheit fuer das Token-Format: OEHTB-Suite/backend/src/lib/auth.ts
// ---------------------------------------------------------------------------

export const SUITE_COOKIE = "suite_token";
export const TOOL_SLUG = process.env.TOOL_SLUG || "handkassen";
export const SUITE_URL = process.env.SUITE_URL || "http://localhost:3000";
const PRUEF_INTERVALL_MS = 60 * 1000;

const JWT_SECRET = process.env.JWT_SECRET || "bitte-aendern";
// Platzhalter-Erkennung suiteweit identisch (siehe Portal & Stunden, drift-check).
const istPlatzhalter = /bitte|ersetzen|aendern|changeme|example|platzhalter/i.test(JWT_SECRET);
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || istPlatzhalter || JWT_SECRET.length < 32)
) {
  throw new Error(
    "JWT_SECRET fehlt oder ist unsicher (>= 32 Zeichen noetig, identisch mit dem Suite-Portal)."
  );
}

export interface SuiteToken {
  sub: string;
  benutzername: string;
  name: string;
  zugriff: Record<string, string>;
  letzteAktivitaet: number;
  geprueftAm: number;
  // Vom Portal gesetzt (Security-Audit 2026-10): Anmeldezeitpunkt (absolute
  // Sitzungsdauer) und Token-Generation (prueft das Portal beim Refresh).
  authTime?: number;
  tokenGeneration?: number;
}

const ABSOLUT_MAX_MS = Number(process.env.SESSION_ABSOLUT_STUNDEN ?? 12) * 60 * 60 * 1000;

// Absolute Sitzungsdauer ab Anmeldung ueberschritten? (Tokens ohne authTime
// stammen aus der Zeit vor dieser Aenderung; sie lehnt das Portal beim
// naechsten Rechte-Refresh ab.)
export function tokenIstAbsolutAbgelaufen(t: SuiteToken): boolean {
  return typeof t.authTime === "number" && Date.now() - t.authTime > ABSOLUT_MAX_MS;
}

export function cookieOptionen(): CookieOptions {
  const secure =
    process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE !== "1";
  return { httpOnly: true, sameSite: "lax", secure, path: "/" };
}

export function tokenPruefen(token: string): SuiteToken {
  const roh = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as SuiteToken;
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

export function tokenSignieren(inhalt: SuiteToken): string {
  // Ablauf nie ueber die absolute Hoechstdauer ab Anmeldung hinaus.
  const restSek =
    typeof inhalt.authTime === "number"
      ? Math.max(1, Math.floor((inhalt.authTime + ABSOLUT_MAX_MS - Date.now()) / 1000))
      : 12 * 60 * 60;
  return jwt.sign(inhalt, JWT_SECRET, { expiresIn: restSek });
}

export function pruefungIstAbgelaufen(token: SuiteToken): boolean {
  return Date.now() - token.geprueftAm > PRUEF_INTERVALL_MS;
}

// Frische Rechte beim Portal holen (Rollenaenderung/Entzug wirkt zeitnah).
// Bei Netzwerkfehler bewusst fail-open (weiter mit bekanntem Stand).
// Ergebnis: frisches Token | "widerrufen" (Portal lehnt verbindlich ab:
// Benutzer geloescht/inaktiv, Token ungueltig) | null (Portal nicht erreichbar
// oder Serverfehler -> fail-open mit dem bisherigen Stand).
// Security-Audit 2026-10: frueher wurde auch die 401 des Portals wie ein
// Netzwerkfehler behandelt.
export type RefreshErgebnis = SuiteToken | "widerrufen" | null;

export async function suiteRefresh(token: string): Promise<RefreshErgebnis> {
  try {
    const res = await fetch(`${SUITE_URL}/api/suite/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.status === 401 || res.status === 403) return "widerrufen";
    if (!res.ok) return null;
    const daten = (await res.json()) as { token?: string };
    if (!daten.token) return null;
    return tokenPruefen(daten.token);
  } catch (err) {
    console.error("Suite-Rechte-Refresh fehlgeschlagen:", err);
    return null;
  }
}
