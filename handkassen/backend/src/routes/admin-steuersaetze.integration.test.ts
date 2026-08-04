import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("Admin Steuersaetze loeschen (Integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedBasis();
  });

  it("loescht einen Steuersatz endgueltig", async () => {
    const satz = await prisma.steuersatz.create({ data: { prozent: 4.9, bezeichnung: "Sondersatz" } });
    const admin = await alsAgent("admin");
    const r = await admin.post(`/api/admin/steuersaetze/${satz.id}/loeschen`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    const nachher = await prisma.steuersatz.findUnique({ where: { id: satz.id } });
    expect(nachher).toBeNull();
  });

  it("schreibt einen Audit-Eintrag beim Loeschen", async () => {
    const satz = await prisma.steuersatz.create({ data: { prozent: 7, bezeichnung: "Weg damit" } });
    const admin = await alsAgent("admin");
    await admin.post(`/api/admin/steuersaetze/${satz.id}/loeschen`);
    const eintrag = await prisma.auditLog.findFirst({
      where: { entitaet: "steuersatz", entitaetId: satz.id, aktion: "steuersatz.geloescht" },
    });
    expect(eintrag).not.toBeNull();
  });

  it("liefert 404 fuer einen nicht vorhandenen Steuersatz", async () => {
    const admin = await alsAgent("admin");
    const r = await admin.post("/api/admin/steuersaetze/999999/loeschen");
    expect(r.status).toBe(404);
  });

  it("verweigert das Loeschen fuer Nicht-Admins (403)", async () => {
    const satz = await prisma.steuersatz.create({ data: { prozent: 8, bezeichnung: "Bleibt" } });
    const erfasser = await alsAgent("erfasser");
    const r = await erfasser.post(`/api/admin/steuersaetze/${satz.id}/loeschen`);
    expect(r.status).toBe(403);
    const nachher = await prisma.steuersatz.findUnique({ where: { id: satz.id } });
    expect(nachher).not.toBeNull();
  });
});
