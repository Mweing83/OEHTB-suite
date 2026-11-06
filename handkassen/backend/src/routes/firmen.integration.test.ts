import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe, type Basis } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Key-User-Feedback 2026-11, Punkt 8: mehrere Firmen mit eigenem Kontenplan,
// eigenen Kostenstellen und getrenntem Export. Die vier Firmen legt die
// Migration an; seedBasis bucht in Firma 1.
run("Mehrere Firmen (Integration)", () => {
  let basis: Basis;

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
  });

  it("die Migration legt die vier Firmen an", async () => {
    const admin = await alsAgent("admin");
    const r = await admin.get("/api/admin/firmen");
    expect(r.body.map((f: { name: string }) => f.name)).toEqual([
      "ÖHTB Dienstleistungen GmbH",
      "ÖHTB Arbeiten GmbH",
      "ÖHTB Wohnen GmbH",
      "ÖHTB Verein",
    ]);
  });

  it("Kontenplan je Firma: gleiche Nummer in zwei Firmen, nicht doppelt in einer", async () => {
    const admin = await alsAgent("admin");
    const zweite = await admin.post("/api/admin/konten").send({ firmaId: 2, nummer: "50000", bezeichnung: "Testkonto F2" });
    expect(zweite.status).toBe(201);
    const doppelt = await admin.post("/api/admin/konten").send({ firmaId: 1, nummer: "50000", bezeichnung: "nochmal" });
    expect(doppelt.status).toBe(409);
    expect((await admin.post("/api/admin/konten").send({ firmaId: 99, nummer: "1", bezeichnung: "x" })).status).toBe(400);
    expect((await admin.post("/api/admin/konten").send({ nummer: "1", bezeichnung: "ohne Firma" })).status).toBe(400);

    const nurF2 = await admin.get("/api/admin/konten?firma=2");
    expect(nurF2.body.map((k: { firmaId: number }) => k.firmaId)).toEqual([2]);
  });

  it("bucht nur auf Konten der Firma der Kostenstelle und zeigt nur diese an", async () => {
    const bereichId = (await prisma.kostenstelle.findUniqueOrThrow({ where: { id: basis.ksA } })).bereichId;
    const fremd = await prisma.konto.create({
      data: { firmaId: 2, nummer: "60000", bezeichnung: "Fremdfirma", bereiche: { create: { bereichId } } },
    });
    const erfasser = await alsAgent("erfasser");
    const konten = await erfasser.get(`/api/konten?kostenstelle=${basis.ksA}`);
    expect(konten.body.map((k: { id: number }) => k.id)).not.toContain(fremd.id);

    const r = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, fremd.id));
    expect(r.status).toBe(400);
    expect(String(r.body.fehler)).toContain("Firma");
  });

  it("Firmenauswahl: Erfasser sieht die Firmen seiner Kostenstellen, Finanzen alle", async () => {
    const erfasser = await alsAgent("erfasser");
    expect((await erfasser.get("/api/firmen")).body).toEqual([{ id: 1, name: "ÖHTB Dienstleistungen GmbH" }]);
    const finanzen = await alsAgent("finanzen");
    expect((await finanzen.get("/api/firmen")).body).toHaveLength(4);
    const ks = await erfasser.get("/api/kostenstellen");
    expect(ks.body[0].firma.name).toBe("ÖHTB Dienstleistungen GmbH");
  });

  it("Export je Firma: nur Buchungen der gewählten Firma, Firma im Dateinamen", async () => {
    await prisma.kostenstelle.update({ where: { id: basis.ksA }, data: { gegenkonto: "99950" } });
    const erfasser = await alsAgent("erfasser");
    expect((await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId))).status).toBe(201);

    const finanzen = await alsAgent("finanzen");
    const f1 = await finanzen.get("/api/export/bmd?firma=1&jahr=2026&monat=5");
    expect(f1.text.trim().split("\r\n")).toHaveLength(2);
    const f3 = await finanzen.get("/api/export/bmd?firma=3&jahr=2026&monat=5");
    expect(f3.status).toBe(200);
    expect(f3.headers["content-disposition"]).toContain("bmd_ka_oehtb_wohnen_gmbh_2026_05.csv");
    expect(f3.text.trim().split("\r\n")).toHaveLength(1); // nur Kopfzeile

    const csv = await finanzen.get("/api/export/csv?firma=3&jahr=2026&monat=5");
    expect(csv.headers["content-disposition"]).toContain("buchungen_oehtb_wohnen_gmbh_2026_05.csv");
    expect((await finanzen.get("/api/export/bmd?jahr=2026&monat=5")).status).toBe(400);
    expect((await finanzen.get("/api/export/bmd?firma=99&jahr=2026&monat=5")).status).toBe(400);
  });

  it("Admin darf Firma von Kostenstelle/Konto ändern, bis ein Monat freigegeben ist", async () => {
    const admin = await alsAgent("admin");
    expect((await admin.put(`/api/admin/kostenstellen/${basis.ksB}`).send({ firmaId: 2 })).status).toBe(200);
    expect((await prisma.kostenstelle.findUniqueOrThrow({ where: { id: basis.ksB } })).firmaId).toBe(2);

    // Mit (Test-)Buchungen in offenen Monaten darf der Admin noch umhängen ...
    const erfasser = await alsAgent("erfasser");
    const b = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
    expect((await admin.put(`/api/admin/kostenstellen/${basis.ksA}`).send({ firmaId: 2 })).status).toBe(200);
    expect((await admin.put(`/api/admin/kostenstellen/${basis.ksA}`).send({ firmaId: 1 })).status).toBe(200);
    expect((await admin.put(`/api/admin/konten/${basis.kontoId}`).send({ firmaId: 2 })).status).toBe(200);
    expect((await admin.put(`/api/admin/konten/${basis.kontoId}`).send({ firmaId: 1 })).status).toBe(200);

    // ... nach der ersten Monatsfreigabe nicht mehr.
    await prisma.buchung.update({ where: { id: b.body.id }, data: { gesperrt: true } });
    await prisma.abschluss.create({
      data: { kostenstelleId: basis.ksA, jahr: 2026, monat: 5, zaehllisteCent: 0, status: "freigegeben", freigegebenAm: new Date() },
    });
    expect((await admin.put(`/api/admin/kostenstellen/${basis.ksA}`).send({ firmaId: 2 })).status).toBe(409);
    expect((await admin.put(`/api/admin/konten/${basis.kontoId}`).send({ firmaId: 2 })).status).toBe(409);
  });

  it("Firmen anlegen, umbenennen, deaktivieren (nur Admin)", async () => {
    const admin = await alsAgent("admin");
    const neu = await admin.post("/api/admin/firmen").send({ name: "Testfirma" });
    expect(neu.status).toBe(201);
    expect((await admin.post("/api/admin/firmen").send({ name: "Testfirma" })).status).toBe(409);
    expect((await admin.put(`/api/admin/firmen/${neu.body.id}`).send({ name: "Testfirma neu" })).body.name).toBe("Testfirma neu");
    expect((await admin.post(`/api/admin/firmen/${neu.body.id}/aktiv`).send({ aktiv: false })).body.aktiv).toBe(false);
    expect((await (await alsAgent("finanzen")).get("/api/firmen")).body).toHaveLength(4);
    expect((await (await alsAgent("erfasser")).post("/api/admin/firmen").send({ name: "x" })).status).toBe(403);
  });
});
