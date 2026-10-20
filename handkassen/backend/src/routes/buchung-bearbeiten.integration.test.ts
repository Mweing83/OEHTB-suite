import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe, type Agent, type Basis } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Direktes Bearbeiten einer Buchung (PUT /api/buchungen/:id), solange die
// Periode nicht freigegeben ist. Kein Storno, keine neue Belegnummer.
run("Buchung bearbeiten (Integration)", () => {
  let basis: Basis;
  let erfasser: Agent;
  let admin: Agent;

  beforeAll(async () => {
    await resetDb();
    await seedBasis();
    erfasser = await alsAgent("erfasser");
    admin = await alsAgent("admin");
  });

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
  });

  async function anlegen(agent: Agent = erfasser, overrides: Record<string, any> = {}) {
    const r = await agent.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId, overrides));
    expect(r.status).toBe(201);
    return r.body as { id: number; buchungsnummer: number; belegnummer: string };
  }

  it("ändert Betrag/Beschreibung direkt, behält Nummern und schreibt Saldo + Audit fort", async () => {
    const b = await anlegen();

    const r = await erfasser.put(`/api/buchungen/${b.id}`).send(
      buchungEingabe(basis.ksA, basis.kontoId, {
        betragCent: 2500,
        beschreibung: "Korrigierter Betrag",
        positionen: [{ betragCent: 2500, steuersatz: 10, kontoId: basis.kontoId }],
      })
    );
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(b.id);
    expect(r.body.buchungsnummer).toBe(b.buchungsnummer);
    expect(r.body.belegnummer).toBe(b.belegnummer);
    expect(r.body.betragCent).toBe(2500);
    expect(r.body.storniert).toBe(false);

    // Genau eine Buchung, keine Storno-/Korrekturbuchung.
    expect(await prisma.buchung.count()).toBe(1);

    const gespeichert = await prisma.buchung.findUnique({ where: { id: b.id }, include: { positionen: true } });
    expect(gespeichert!.beschreibung).toBe("Korrigierter Betrag");
    expect(gespeichert!.positionen).toHaveLength(1);
    expect(gespeichert!.positionen[0].betragCent).toBe(2500);
    expect(gespeichert!.positionen[0].steuersatz.toNumber()).toBe(10);

    // Saldo: vorher -1000 (Ausgang 10 €), jetzt -2500.
    const ks = await prisma.kostenstelle.findUnique({ where: { id: basis.ksA } });
    expect(ks!.saldoCent).toBe(-2500);

    const audit = await prisma.auditLog.findFirst({ where: { aktion: "buchung.geaendert", entitaetId: b.id } });
    expect(audit).not.toBeNull();
    expect((audit!.alteWerte as any).betragCent).toBe(1000);
    expect((audit!.neueWerte as any).betragCent).toBe(2500);
  });

  it("rechnet einen Typwechsel (Ausgang -> Eingang) korrekt in den Saldo", async () => {
    const b = await anlegen();
    const r = await erfasser
      .put(`/api/buchungen/${b.id}`)
      .send(buchungEingabe(basis.ksA, basis.kontoId, { typ: "eingang" }));
    expect(r.status).toBe(200);
    const ks = await prisma.kostenstelle.findUnique({ where: { id: basis.ksA } });
    expect(ks!.saldoCent).toBe(1000);
  });

  it("lehnt das Bearbeiten einer gesperrten Buchung ab (409) und ändert nichts", async () => {
    const b = await anlegen();
    await prisma.buchung.update({ where: { id: b.id }, data: { gesperrt: true } });

    const r = await erfasser
      .put(`/api/buchungen/${b.id}`)
      .send(buchungEingabe(basis.ksA, basis.kontoId, { betragCent: 2500, positionen: [{ betragCent: 2500, steuersatz: 20, kontoId: basis.kontoId }] }));
    expect(r.status).toBe(409);

    const gespeichert = await prisma.buchung.findUnique({ where: { id: b.id } });
    expect(gespeichert!.betragCent).toBe(1000);
    const ks = await prisma.kostenstelle.findUnique({ where: { id: basis.ksA } });
    expect(ks!.saldoCent).toBe(-1000);
  });

  it("lehnt das Bearbeiten einer stornierten Buchung ab (409)", async () => {
    const b = await anlegen();
    const rS = await erfasser.post(`/api/buchungen/${b.id}/storno`);
    expect(rS.status).toBe(200);

    const r = await erfasser.put(`/api/buchungen/${b.id}`).send(buchungEingabe(basis.ksA, basis.kontoId));
    expect(r.status).toBe(409);
  });

  it("lehnt einen Wechsel des Belegjahres ab (400), weil die Belegnummer am Jahr hängt", async () => {
    const b = await admin.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
    expect(b.status).toBe(201);
    const r = await admin
      .put(`/api/buchungen/${b.body.id}`)
      .send(buchungEingabe(basis.ksA, basis.kontoId, { belegdatum: "2025-05-15" }));
    expect(r.status).toBe(400);
    const gespeichert = await prisma.buchung.findUnique({ where: { id: b.body.id } });
    expect(gespeichert!.belegdatum.toISOString().slice(0, 10)).toBe("2026-05-15");
  });

  it("verweigert Erfassern das Bearbeiten in einem gesperrten Monat, erlaubt es Admins", async () => {
    // Januar 2026 ist nach Frist-Regel laengst gesperrt; nur Admin kann dort anlegen.
    const b = await anlegen(admin, { belegdatum: "2026-01-15" });

    const rErfasser = await erfasser
      .put(`/api/buchungen/${b.id}`)
      .send(buchungEingabe(basis.ksA, basis.kontoId, { belegdatum: "2026-01-15", beschreibung: "x" }));
    expect(rErfasser.status).toBe(409);

    const rAdmin = await admin
      .put(`/api/buchungen/${b.id}`)
      .send(buchungEingabe(basis.ksA, basis.kontoId, { belegdatum: "2026-01-15", beschreibung: "x" }));
    expect(rAdmin.status).toBe(200);
  });

  it("verweigert Erfassern das Verschieben in einen gesperrten Monat (409)", async () => {
    const b = await anlegen();
    const r = await erfasser
      .put(`/api/buchungen/${b.id}`)
      .send(buchungEingabe(basis.ksA, basis.kontoId, { belegdatum: "2026-01-15" }));
    expect(r.status).toBe(409);
  });

  it("verweigert das Bearbeiten ohne Zugriff auf die Kostenstelle (403)", async () => {
    const rB = await admin.post("/api/buchungen").send(buchungEingabe(basis.ksB, basis.kontoId));
    expect(rB.status).toBe(201);
    const r = await erfasser.put(`/api/buchungen/${rB.body.id}`).send(buchungEingabe(basis.ksB, basis.kontoId));
    expect(r.status).toBe(403);
  });

  it("behält die Kostenstelle, auch wenn eine andere mitgeschickt wird", async () => {
    const b = await anlegen();
    const r = await admin.put(`/api/buchungen/${b.id}`).send(buchungEingabe(basis.ksB, basis.kontoId));
    expect(r.status).toBe(200);
    const gespeichert = await prisma.buchung.findUnique({ where: { id: b.id } });
    expect(gespeichert!.kostenstelleId).toBe(basis.ksA);
  });

  it("behält den Beleg ohne neue belegId und ersetzt ihn mit neuer belegId", async () => {
    const alt = await prisma.beleg.create({ data: { dateipfad: "alt.jpg", originalname: "alt.jpg", hochgeladenVonId: basis.benutzer.erfasserA } });
    const b = await anlegen(erfasser, { belegId: alt.id });

    const r1 = await erfasser.put(`/api/buchungen/${b.id}`).send(buchungEingabe(basis.ksA, basis.kontoId));
    expect(r1.status).toBe(200);
    expect((await prisma.buchung.findUnique({ where: { id: b.id } }))!.belegId).toBe(alt.id);

    const neu = await prisma.beleg.create({ data: { dateipfad: "neu.jpg", originalname: "neu.jpg", hochgeladenVonId: basis.benutzer.erfasserA } });
    const r2 = await erfasser.put(`/api/buchungen/${b.id}`).send(buchungEingabe(basis.ksA, basis.kontoId, { belegId: neu.id }));
    expect(r2.status).toBe(200);
    expect((await prisma.buchung.findUnique({ where: { id: b.id } }))!.belegId).toBe(neu.id);
    // Alter Beleg-Datensatz ist weg (haengt an keiner Buchung mehr).
    expect(await prisma.beleg.findUnique({ where: { id: alt.id } })).toBeNull();
  });
});
