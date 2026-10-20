import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resetDb, seedBasis, alsAgent } from "../test/helfer.js";

// Integrationstests laufen nur, wenn ausdrücklich eine Testdatenbank gesetzt ist.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Security-Audit 2026-10: Verzeichnis-Browser nur im Sicherungsbereich.
// BACKUP_LOKAL_PFAD wird in setup.ts nicht gesetzt -> Standard ../backups
// relativ zum Arbeitsverzeichnis; der Test legt ihn bei Bedarf an.
const wurzel = path.resolve(process.env.BACKUP_LOKAL_PFAD || path.resolve(process.cwd(), "..", "backups"));

run("Admin-Verzeichnis-Browser (Integration)", () => {
  beforeAll(() => {
    fs.mkdirSync(path.join(wurzel, "taeglich"), { recursive: true });
  });

  beforeEach(async () => {
    await resetDb();
    await seedBasis();
  });

  it("startet im Sicherungsbereich und listet dessen Ordner", async () => {
    const r = await (await alsAgent("admin")).get("/api/admin/verzeichnis");
    expect(r.status).toBe(200);
    expect(r.body.pfad).toBe(fs.realpathSync(wurzel));
    expect(r.body.ordner).toContain("taeglich");
    expect(r.body.elternpfad).toBeNull();
  });

  it("verweigert Pfade außerhalb und verrät keine Dateisystem-Fehler", async () => {
    const admin = await alsAgent("admin");
    for (const pfad of ["/", "/etc", os.tmpdir(), path.join(wurzel, ".."), "/gibt/es/nicht"]) {
      const r = await admin.get(`/api/admin/verzeichnis?pfad=${encodeURIComponent(pfad)}`);
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).not.toMatch(/ENOENT|EACCES|scandir/);
    }
  });

  it("speichert nur Lese-Pfade innerhalb des Sicherungsbereichs", async () => {
    const admin = await alsAgent("admin");
    const daten = { uhrzeit: "02:00", aufbewahrungTaeglich: 7, aufbewahrungMonatlich: 12, zielNasAktiv: false, zielUsbAktiv: false };
    const schlecht = await admin.put("/api/admin/backup").send({ ...daten, pfadLokal: "/etc" });
    expect(schlecht.status).toBe(400);
    const gut = await admin.put("/api/admin/backup").send({ ...daten, pfadLokal: path.join(wurzel, "taeglich") });
    expect(gut.status).toBe(200);
  });
});
