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

// Darf in der Periode dieses Datums noch gebucht, bearbeitet, storniert oder
// gelöscht werden? Liefert null (ja) oder die Fehlermeldung für die Antwort
// (HTTP 409). Eine Stelle für alle vier Vorgänge:
//   1. Ein freigegebener Monatsabschluss sperrt die Periode für alle.
//   2. Die Monatssperre (Frist bzw. manuell) sperrt für alle außer Admins.
export async function periodeGesperrtMeldung(
  kostenstelleId: number,
  datum: Date,
  rolle: string,
  taetigkeit: "buchen" | "bearbeiten" | "stornieren" | "löschen"
): Promise<string | null> {
  const jahr = datum.getFullYear();
  const monat = datum.getMonth() + 1;
  const abschluss = await prisma.abschluss.findUnique({
    where: { kostenstelleId_jahr_monat: { kostenstelleId, jahr, monat } },
  });
  if (abschluss && (abschluss.status === "freigegeben" || abschluss.freigegebenAm)) {
    return "Periode ist freigegeben und gesperrt.";
  }
  if (rolle !== "admin" && (await monatGesperrt(kostenstelleId, jahr, monat))) {
    return `Dieser Monat ist gesperrt. Nur Administratoren können hier noch ${taetigkeit}.`;
  }
  return null;
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
