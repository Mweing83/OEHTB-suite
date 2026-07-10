import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../lib/db.js";
import { app } from "../server.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe, type Agent, type Basis } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("buchungen-Routen (Integration)", () => {
  let basis: Basis;
  let erfasser: Agent;
  let admin: Agent;

  beforeAll(async () => {
    // Einmal anmelden (die Benutzer-IDs bleiben über das Reseeding stabil, da
    // RESTART IDENTITY die Sequenzen zurücksetzt – die Tokens bleiben gültig).
    await resetDb();
    await seedBasis();
    erfasser = await alsAgent("erfasser");
    admin = await alsAgent("admin");
  });

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
  });

  it("legt eine gültige Buchung an und schreibt den Saldo fort", async () => {
    const r = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
    expect(r.status).toBe(201);
    expect(r.body.belegnummer).toBe("2026-1000-01");

    const ks = await prisma.kostenstelle.findUnique({ where: { id: basis.ksA } });
    expect(ks!.saldoCent).toBe(-1000); // Ausgang 10,00 €
  });

  it("lehnt eine Buchung ab, deren Positionssumme nicht passt (400)", async () => {
    const eingabe = buchungEingabe(basis.ksA, basis.kontoId, {
      betragCent: 1000,
      positionen: [{ betragCent: 999, steuersatz: 20, kontoId: basis.kontoId }],
    });
    const r = await erfasser.post("/api/buchungen").send(eingabe);
    expect(r.status).toBe(400);
  });

  it("lehnt einen nicht aktiven Steuersatz ab (400)", async () => {
    const eingabe = buchungEingabe(basis.ksA, basis.kontoId, {
      positionen: [{ betragCent: 1000, steuersatz: 13, kontoId: basis.kontoId }],
    });
    const r = await erfasser.post("/api/buchungen").send(eingabe);
    expect(r.status).toBe(400);
  });

  it("verweigert das Buchen auf einer nicht freigeschalteten Kostenstelle (403)", async () => {
    const r = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksB, basis.kontoId));
    expect(r.status).toBe(403);
  });

  it("verlangt für das Auflisten eine Anmeldung (401)", async () => {
    const r = await request(app).get(`/api/buchungen?kostenstelle=${basis.ksA}`);
    expect(r.status).toBe(401);
  });

  it("sperrt einen längst abgelaufenen Monat für Erfasser, erlaubt ihn aber Admins", async () => {
    const alt = buchungEingabe(basis.ksA, basis.kontoId, { belegdatum: "2020-01-15" });

    const rErfasser = await erfasser.post("/api/buchungen").send(alt);
    expect(rErfasser.status).toBe(409);

    const rAdmin = await admin.post("/api/buchungen").send(alt);
    expect(rAdmin.status).toBe(201);
  });
});
