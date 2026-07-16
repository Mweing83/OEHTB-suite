// Vitest-Setup (laeuft VOR den Testdateien, bevor lib/prisma.ts den Client mit
// DATABASE_URL erzeugt). Stellt den Testbetrieb sicher. Muster: stunden.

process.env.NODE_ENV = "test";

process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-secret-nur-fuer-integrationstests-min-32-zeichen";
process.env.PROVISION_SECRET =
  process.env.PROVISION_SECRET || "test-provision-secret-min-16-zeichen";
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "testschluessel-genau-32-zeichen!";

// DB-Verbindung NUR auf die ausdruecklich gesetzte Testdatenbank umleiten.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
