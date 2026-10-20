import { createHash, randomInt, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Einmaliger Einrichtungscode fuer das Erst-/Neusetzen eines Passworts.
//
// Hintergrund (Security-Audit 2026-10): passwort-setzen war ohne jeden
// Besitznachweis erreichbar – wer den Benutzernamen eines Kontos mit
// passwortSetzen=true kannte, konnte es uebernehmen (inkl. Seed-Admin).
// Jetzt braucht das Setzen einen Code, den nur der ausstellende Admin (bzw.
// beim Erststart das Container-Log) kennt.
//
// - 12 Zeichen aus 32 eindeutigen Zeichen (ohne 0/O/1/I) ≈ 60 Bit, Anzeige
//   in Dreiergruppen à 4 Zeichen (ABCD-EFGH-JKLM).
// - Gespeichert wird nur der SHA-256-Hash (bei 60 Bit Zufall reicht ein
//   schneller Hash; Brute-Force bremst zusaetzlich das Login-Limit).
// - Gueltig GUELTIG_TAGE Tage, wird nach erfolgreichem Setzen geloescht.
// ---------------------------------------------------------------------------

const ZEICHEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LAENGE = 12;
export const GUELTIG_TAGE = 7;

function normalisieren(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashen(code: string): string {
  return createHash("sha256").update(normalisieren(code)).digest("hex");
}

export interface NeuerCode {
  klartext: string; // nur einmal anzeigen, nie speichern
  hash: string;
  bis: Date;
}

export function einrichtungsCodeErzeugen(jetzt = new Date()): NeuerCode {
  let roh = "";
  for (let i = 0; i < LAENGE; i++) roh += ZEICHEN[randomInt(ZEICHEN.length)];
  const klartext = roh.match(/.{4}/g)!.join("-");
  const bis = new Date(jetzt.getTime() + GUELTIG_TAGE * 24 * 60 * 60 * 1000);
  return { klartext, hash: hashen(roh), bis };
}

// Prueft einen eingegebenen Code gegen den gespeicherten Hash (zeitkonstant)
// und die Ablaufzeit.
export function einrichtungsCodePruefen(
  eingabe: string,
  gespeicherterHash: string | null,
  bis: Date | null,
  jetzt = new Date()
): boolean {
  if (!gespeicherterHash || !bis || bis.getTime() < jetzt.getTime()) return false;
  if (normalisieren(eingabe).length !== LAENGE) return false;
  const a = Buffer.from(hashen(eingabe), "hex");
  const b = Buffer.from(gespeicherterHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
