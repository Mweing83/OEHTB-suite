import { prisma } from "./db.js";

// Liest die Sperr-Frist (Tage nach Monatsende) aus der Allgemein-Konfiguration.
// Fehlt die Zeile noch, gilt der Standard von 5 Tagen.
export async function sperrFristTage(): Promise<number> {
  const k = await prisma.allgemeinKonfig.findFirst({ orderBy: { id: "asc" } });
  return k?.sperrFristTage ?? 5;
}

// Berechnet rein automatisch (nur Frist-Regel), ob ein Monat gesperrt ist:
// gesperrt, sobald heute >= erster Tag des Folgemonats + Frist (Tage).
export function autoGesperrt(jahr: number, monat: number, fristTage: number, jetzt = new Date()): boolean {
  // new Date(jahr, monat, 1) ist der erste Tag des FOLGEmonats (monat ist 1-basiert).
  const sperrAb = new Date(jahr, monat, 1);
  sperrAb.setDate(sperrAb.getDate() + fristTage);
  return jetzt >= sperrAb;
}

// Effektive Sperre eines Monats (einer Kostenstelle), UNABHÄNGIG von der Rolle.
// Eine manuelle MonatsSperre (Admin) hat Vorrang vor der automatischen Frist.
export async function monatGesperrt(kostenstelleId: number, jahr: number, monat: number): Promise<boolean> {
  const explizit = await prisma.monatsSperre.findUnique({
    where: { kostenstelleId_jahr_monat: { kostenstelleId, jahr, monat } },
  });
  if (explizit) return explizit.gesperrt;
  return autoGesperrt(jahr, monat, await sperrFristTage());
}
