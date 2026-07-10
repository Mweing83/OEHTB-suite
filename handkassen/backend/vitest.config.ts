import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Läuft vor jeder Testdatei: setzt NODE_ENV/JWT und leitet – falls
    // TEST_DATABASE_URL gesetzt ist – die DB-Verbindung auf die Testdatenbank um.
    setupFiles: ["./src/test/setup.ts"],
    // Integrationstests teilen sich eine DB; parallele Worker würden sich
    // gegenseitig die Daten löschen. Daher seriell ausführen.
    fileParallelism: false,
    // bcrypt-Hashing in der Anmeldung kann beim ersten Mal etwas dauern.
    testTimeout: 20000,
  },
});
