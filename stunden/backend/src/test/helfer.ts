import { prisma } from "../lib/prisma";

// Von setup.ts gesetzt; hier fuer die Tests zugaenglich gemacht.
export const PROVISION_SECRET = process.env.PROVISION_SECRET as string;

// Leert alle Tabellen und setzt Auto-IDs zurueck. audit_log ist per Trigger
// gegen UPDATE/DELETE geschuetzt; TRUNCATE bleibt erlaubt (Statement-Ebene).
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE audit_log, "Beschaeftigung", "Aenderungsanfrage",
      "Mitarbeiter", "User", "Einstellung"
    RESTART IDENTITY CASCADE;
  `);
}
