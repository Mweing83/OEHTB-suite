import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Laeuft vor jeder Testdatei: setzt NODE_ENV/Secrets und leitet – falls
    // TEST_DATABASE_URL gesetzt ist – die DB-Verbindung auf die Testdatenbank um.
    setupFiles: ["./src/test/setup.ts"],
    // Integrationstests teilen sich eine DB; parallele Worker wuerden sich
    // gegenseitig die Daten loeschen. Daher seriell.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
