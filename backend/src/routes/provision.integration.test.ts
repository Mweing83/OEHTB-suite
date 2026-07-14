import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { resetDb, seedToolMitUser, PROVISION_SECRET } from "../test/helfer";

// Integrationstests laufen nur mit ausdruecklich gesetzter Testdatenbank.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("Provision-Snapshot (Portal, Integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lehnt ohne Secret mit 401 ab", async () => {
    const r = await request(app).get(
      "/api/suite/provision/snapshot?tool=handkassen",
    );
    expect(r.status).toBe(401);
  });

  it("lehnt mit falschem Secret mit 401 ab", async () => {
    const r = await request(app)
      .get("/api/suite/provision/snapshot?tool=handkassen")
      .set("X-Provision-Secret", "falsch");
    expect(r.status).toBe(401);
  });

  it("liefert mit korrektem Secret die Benutzerliste des Tools", async () => {
    await seedToolMitUser();
    const r = await request(app)
      .get("/api/suite/provision/snapshot?tool=handkassen")
      .set("X-Provision-Secret", PROVISION_SECRET);
    expect(r.status).toBe(200);
    expect(r.body.tool).toBe("handkassen");
    expect(r.body.users).toHaveLength(1);
    expect(r.body.users[0].benutzername).toBe("testuser");
    expect(r.body.users[0].rolle).toBe("erfasser");
  });

  it("liefert 404 fuer ein unbekanntes Tool", async () => {
    const r = await request(app)
      .get("/api/suite/provision/snapshot?tool=gibtsnicht")
      .set("X-Provision-Secret", PROVISION_SECRET);
    expect(r.status).toBe(404);
  });
});

run("Auth (Portal, Integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lehnt einen unbekannten Benutzer beim Login mit 401 ab", async () => {
    const r = await request(app)
      .post("/api/suite/auth/login")
      .send({ benutzername: "gibtsnicht", passwort: "irgendwas" });
    expect(r.status).toBe(401);
  });
});
