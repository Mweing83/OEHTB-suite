import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { resetDb, PROVISION_SECRET } from "../test/helfer";

// Integrationstests laufen nur mit ausdruecklich gesetzter Testdatenbank.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const nutzlast = {
  suiteUserId: "suite-user-1",
  benutzername: "testuser",
  name: "Test User",
  email: "test@example.org",
  aktiv: true,
  rolle: "SACHBEARBEITER",
};

run("Provision-Empfang (Stunden, Integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lehnt ohne Secret mit 401 ab", async () => {
    const r = await request(app).put("/api/provision/user").send(nutzlast);
    expect(r.status).toBe(401);
  });

  it("lehnt mit falschem Secret mit 401 ab", async () => {
    const r = await request(app)
      .put("/api/provision/user")
      .set("X-Provision-Secret", "falsch")
      .send(nutzlast);
    expect(r.status).toBe(401);
  });

  it("legt mit korrektem Secret den Benutzer an (Upsert)", async () => {
    const r = await request(app)
      .put("/api/provision/user")
      .set("X-Provision-Secret", PROVISION_SECRET)
      .send(nutzlast);
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({
      where: { suiteUserId: "suite-user-1" },
    });
    expect(u).not.toBeNull();
    expect(u?.rolle).toBe("SACHBEARBEITER");
  });

  it("lehnt eine unvollstaendige Nutzlast mit 400 ab", async () => {
    const r = await request(app)
      .put("/api/provision/user")
      .set("X-Provision-Secret", PROVISION_SECRET)
      .send({ name: "ohne IDs" });
    expect(r.status).toBe(400);
  });
});

run("Auth-Schutz (Stunden, Integration)", () => {
  it("schuetzt /api/mitarbeiter: ohne Suite-Token 401", async () => {
    const r = await request(app).get("/api/mitarbeiter");
    expect(r.status).toBe(401);
  });
});
