// Vitest-Setup (laeuft VOR den Testdateien, bevor lib/prisma.ts den Client mit
// DATABASE_URL erzeugt). Stellt den Testbetrieb sicher.

// index.ts startet im Testbetrieb keinen Listener (siehe NODE_ENV-Guard).
process.env.NODE_ENV = "test";

// Feste Test-Secrets. dotenv/config ueberschreibt bereits gesetzte Werte nicht.
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-secret-nur-fuer-integrationstests-min-32-zeichen";
process.env.PROVISION_SECRET =
  process.env.PROVISION_SECRET || "test-provision-secret-min-16-zeichen";

// DB-Verbindung NUR auf die ausdruecklich gesetzte Testdatenbank umleiten.
// Ohne TEST_DATABASE_URL ueberspringen sich die Integrationstests selbst –
// so laeuft kein Test versehentlich gegen die Entwicklungs-/Produktiv-DB.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
