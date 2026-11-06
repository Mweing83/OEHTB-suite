import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe, type Basis } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Key-User-Feedback 2026-11: Pflichtfelder, fixer Steuersatz, Belegnummer-Vorschau.
run("Buchungsformular: Pflichtfelder, fixer Steuersatz, Vorschau (Integration)", () => {
  let basis: Basis;

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
  });

  it("Beschreibung ist Pflicht, ungültige Tage werden abgelehnt", async () => {
    const erfasser = await alsAgent("erfasser");
    const ohne = await erfasser
      .post("/api/buchungen")
      .send(buchungEingabe(basis.ksA, basis.kontoId, { beschreibung: "" }));
    expect(ohne.status).toBe(400);
    const tag31 = await erfasser
      .post("/api/buchungen")
      .send(buchungEingabe(basis.ksA, basis.kontoId, { belegdatum: "2026-09-31" }));
    expect(tag31.status).toBe(400);
    expect(await prisma.buchung.count()).toBe(0);
  });

  it("Konto mit fixem Steuersatz: nur dieser Satz ist buchbar", async () => {
    const admin = await alsAgent("admin");
    const r = await admin.put(`/api/admin/konten/${basis.kontoId}`).send({ fixSteuersatz: 0 });
    expect(r.status).toBe(200);
    expect(r.body.fixSteuersatz).toBe(0);

    const erfasser = await alsAgent("erfasser");
    const konten = await erfasser.get(`/api/konten?kostenstelle=${basis.ksA}`);
    expect(konten.body.find((k: { id: number }) => k.id === basis.kontoId).fixSteuersatz).toBe(0);

    const falsch = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
    expect(falsch.status).toBe(400);
    expect(String(falsch.body.fehler)).toContain("fixen Steuersatz");

    const richtig = await erfasser.post("/api/buchungen").send(
      buchungEingabe(basis.ksA, basis.kontoId, {
        positionen: [{ betragCent: 1000, steuersatz: 0, kontoId: basis.kontoId }],
      })
    );
    expect(richtig.status).toBe(201);

    // Fixierung aufheben und ungültige Werte ablehnen
    expect((await admin.put(`/api/admin/konten/${basis.kontoId}`).send({ fixSteuersatz: 150 })).status).toBe(400);
    const auf = await admin.put(`/api/admin/konten/${basis.kontoId}`).send({ fixSteuersatz: null });
    expect(auf.body.fixSteuersatz).toBeNull();
  });

  it("Vorschau zeigt die nächste Belegnummer und prüft den Zugriff", async () => {
    const erfasser = await alsAgent("erfasser");
    const vorher = await erfasser.get(`/api/buchungen/naechste-belegnummer?kostenstelle=${basis.ksA}&jahr=2026&monat=5`);
    expect(vorher.status).toBe(200);
    expect(vorher.body.belegnummer).toBe("2026-1000-01");

    const b = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
    expect(b.body.belegnummer).toBe("2026-1000-01");
    const nachher = await erfasser.get(`/api/buchungen/naechste-belegnummer?kostenstelle=${basis.ksA}&jahr=2026&monat=5`);
    expect(nachher.body.belegnummer).toBe("2026-1000-02");

    expect((await erfasser.get(`/api/buchungen/naechste-belegnummer?kostenstelle=${basis.ksB}&jahr=2026&monat=5`)).status).toBe(403);
    expect((await erfasser.get(`/api/buchungen/naechste-belegnummer?kostenstelle=${basis.ksA}`)).status).toBe(400);
  });
});
