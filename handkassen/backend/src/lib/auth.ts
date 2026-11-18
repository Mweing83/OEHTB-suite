import bcrypt from "bcryptjs";

// Anmeldung, Token und Cookie liegen seit dem Suite-SSO in lib/suiteAuth.ts.
// Hier bleiben nur der Typ des angemeldeten Benutzers und die Passwort-Helfer:
// Letztere braucht noch der Seed (Demo-Konten entschärfen) und der Testhelfer,
// solange die alten Passwort-Spalten in der Datenbank existieren.

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
