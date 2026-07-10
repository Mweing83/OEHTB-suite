import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../server.js";
import { resetDb, seedBasis, alsAgent, TEST_PW } from "../test/helfer.js";

// Integrationstests laufen nur, wenn ausdrücklich eine Testdatenbank gesetzt ist.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("auth-Routen (Integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedBasis();
  });

  it("meldet einen gültigen Benutzer an und liefert die Rolle", async () => {
    const r = await request(app).post("/api/auth/login").send({ benutzername: "erfasser", passwort: TEST_PW });
    expect(r.status).toBe(200);
    expect(r.body.rolle).toBe("erfasser");
    const cookies = r.headers["set-cookie"] as unknown as string[];
    expect(cookies.join(";")).toContain("token=");
  });

  it("lehnt ein falsches Passwort mit 401 ab", async () => {
    const r = await request(app).post("/api/auth/login").send({ benutzername: "erfasser", passwort: "falsch" });
    expect(r.status).toBe(401);
  });

  it("lehnt einen unbekannten Benutzer mit 401 ab", async () => {
    const r = await request(app).post("/api/auth/login").send({ benutzername: "gibtsnicht", passwort: TEST_PW });
    expect(r.status).toBe(401);
  });

  it("verlangt beim Erstlogin das Setzen eines Passworts (409)", async () => {
    const r = await request(app).post("/api/auth/login").send({ benutzername: "neu", passwort: TEST_PW });
    expect(r.status).toBe(409);
    expect(r.body.passwortSetzenErforderlich).toBe(true);
  });

  it("schützt /me: ohne Anmeldung 401", async () => {
    const r = await request(app).get("/api/auth/me");
    expect(r.status).toBe(401);
  });

  it("liefert nach Anmeldung das eigene Profil über /me", async () => {
    const agent = await alsAgent("erfasser");
    const r = await agent.get("/api/auth/me");
    expect(r.status).toBe(200);
    expect(r.body.benutzername).toBe("erfasser");
  });
});
