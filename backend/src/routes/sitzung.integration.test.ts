import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { resetDb } from "../test/helfer";
import { passwortHashen, tokenSignieren, SUITE_COOKIE } from "../lib/auth";

// Integrationstests laufen nur mit ausdruecklich gesetzter Testdatenbank.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Security-Audit 2026-10: Tokens muessen nach Passwortwechsel, Passwort-Reset
// und Logout ungueltig sein und duerfen nicht endlos gleitend weiterleben.
function cookieAus(res: request.Response): string {
  const roh = (res.headers["set-cookie"] as unknown as string[]) ?? [];
  const letzter = [...roh].reverse().find((c) => c.startsWith(`${SUITE_COOKIE}=`))!;
  return letzter.split(";")[0];
}

async function anmelden(): Promise<string> {
  const r = await request(app)
    .post("/api/suite/auth/login")
    .send({ benutzername: "anna", passwort: "anna-passwort-1" });
  expect(r.status).toBe(200);
  return cookieAus(r);
}

run("Sitzungs-Invalidierung (Portal, Integration)", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const u = await prisma.suiteUser.create({
      data: {
        benutzername: "anna",
        name: "Anna",
        passwortSetzen: false,
        passwortHash: await passwortHashen("anna-passwort-1"),
      },
    });
    userId = u.id;
  });

  it("Passwortwechsel macht andere Sitzungen ungueltig, die eigene bleibt", async () => {
    const geraetA = await anmelden();
    const geraetB = await anmelden();

    const w = await request(app)
      .post("/api/suite/auth/passwort-aendern")
      .set("Cookie", geraetA)
      .send({ aktuellesPasswort: "anna-passwort-1", neuesPasswort: "anna-passwort-2" });
    expect(w.status).toBe(200);

    expect((await request(app).get("/api/suite/auth/me").set("Cookie", geraetB)).status).toBe(401);
    const neuA = cookieAus(w);
    expect((await request(app).get("/api/suite/auth/me").set("Cookie", neuA)).status).toBe(200);
  });

  it("Logout macht auch ein kopiertes Token wertlos", async () => {
    const c = await anmelden();
    expect((await request(app).post("/api/suite/auth/logout").set("Cookie", c)).status).toBe(200);
    expect((await request(app).get("/api/suite/auth/me").set("Cookie", c)).status).toBe(401);
    // Refresh (Tools) lehnt es ebenfalls ab.
    const tokenWert = c.split("=")[1];
    const r = await request(app).post("/api/suite/auth/refresh").send({ token: tokenWert });
    expect(r.status).toBe(401);
  });

  it("Admin-Reset beendet laufende Sitzungen", async () => {
    const c = await anmelden();
    await prisma.suiteUser.update({
      where: { id: userId },
      data: { tokenGeneration: { increment: 1 } },
    });
    expect((await request(app).get("/api/suite/auth/me").set("Cookie", c)).status).toBe(401);
  });

  it("absolute Hoechstdauer: Token mit alter Anmeldezeit wird abgelehnt", async () => {
    const jetzt = Date.now();
    const token = tokenSignieren({
      sub: userId,
      benutzername: "anna",
      name: "Anna",
      zugriff: {},
      tokenGeneration: 0,
      letzteAktivitaet: jetzt,
      geprueftAm: jetzt,
      authTime: jetzt - 13 * 60 * 60 * 1000,
    });
    const r = await request(app).get("/api/suite/auth/me").set("Cookie", `${SUITE_COOKIE}=${token}`);
    expect(r.status).toBe(401);
  });

  it("Altbestand-Token ohne Generation/Anmeldezeit wird abgelehnt", async () => {
    const jwt = await import("jsonwebtoken");
    const jetzt = Date.now();
    const alt = jwt.default.sign(
      { sub: userId, benutzername: "anna", name: "Anna", zugriff: {}, letzteAktivitaet: jetzt, geprueftAm: jetzt },
      process.env.JWT_SECRET as string,
      { expiresIn: "12h" }
    );
    const r = await request(app).get("/api/suite/auth/me").set("Cookie", `${SUITE_COOKIE}=${alt}`);
    expect(r.status).toBe(401);
  });
});
