import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../server.js";
import { resetDb, seedBasis, alsAgent } from "../test/helfer.js";

// Integrationstests laufen nur, wenn ausdrücklich eine Testdatenbank gesetzt ist.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Login/Passwort liegen seit der Suite-Integration zentral im Portal. Dieses
// Tool bietet nur noch /me (Profil des per SSO-Cookie Angemeldeten) und
// /logout (lokales Cookie-Löschen). Die Tests prüfen daher genau diese beiden.
run("auth-Routen (Integration, SSO)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedBasis();
  });

  it("schützt /me: ohne Anmeldung 401", async () => {
    const r = await request(app).get("/api/auth/me");
    expect(r.status).toBe(401);
  });

  it("lehnt ein ungültiges Token mit 401 ab", async () => {
    const r = await request(app)
      .get("/api/auth/me")
      .set("Cookie", ["suite_token=kein-gueltiges-jwt"]);
    expect(r.status).toBe(401);
  });

  it("liefert nach Anmeldung das eigene Profil über /me", async () => {
    const agent = await alsAgent("erfasser");
    const r = await agent.get("/api/auth/me");
    expect(r.status).toBe(200);
    expect(r.body.benutzername).toBe("erfasser");
    expect(r.body.rolle).toBe("erfasser");
  });

  it("leitet die für dieses Tool geltende Rolle aus dem Token ab", async () => {
    const agent = await alsAgent("admin");
    const r = await agent.get("/api/auth/me");
    expect(r.status).toBe(200);
    expect(r.body.rolle).toBe("admin");
  });

  it("/logout löscht das Suite-Cookie (best effort)", async () => {
    const r = await request(app).post("/api/auth/logout");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    const cookies = (r.headers["set-cookie"] as unknown as string[]) ?? [];
    expect(cookies.join(";")).toContain("suite_token=");
  });
});
