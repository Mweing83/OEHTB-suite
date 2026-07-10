// Vitest-Setup: läuft VOR den Testdateien (also bevor lib/db.ts den Prisma-Client
// mit DATABASE_URL erzeugt). Hier stellen wir den Testbetrieb sicher.

// Testbetrieb: server.ts startet keinen Listener; cookieOptionen() liefert
// secure:false, sodass supertest über HTTP das Cookie behält.
process.env.NODE_ENV = "test";

// Festes Test-Secret, damit JWTs erstellt/geprüft werden können.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-nur-fuer-integrationstests";

// DB-Verbindung NUR auf die ausdrücklich gesetzte Testdatenbank umleiten.
// Ohne TEST_DATABASE_URL überspringen sich die Integrationstests selbst –
// so läuft kein Test versehentlich gegen die Entwicklungs-/Produktiv-DB.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
