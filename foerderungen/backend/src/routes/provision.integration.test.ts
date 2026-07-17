import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { resetDb, anmeldeCookie, PROVISION_SECRET } from "../test/helfer";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("Provisionierung & SSO", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lehnt Provisionierung ohne Secret ab", async () => {
    const res = await request(app).put("/api/provision/user").send({});
    expect(res.status).toBe(401);
  });

  it("legt Nutzer an und /api/auth/me liefert ihn", async () => {
    const cookie = await anmeldeCookie(app);
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.name).toBe("Test Nutzer");
    expect(me.body.rolle).toBe("nutzer");
  });

  it("sperrt Nutzer ohne Tool-Rolle", async () => {
    await request(app)
      .put("/api/provision/user")
      .set("X-Provision-Secret", PROVISION_SECRET)
      .send({
        suiteUserId: "suite-test-2",
        benutzername: "ohne",
        name: "Ohne Zugriff",
        email: null,
        aktiv: true,
        rolle: null,
      })
      .expect(200);
    const u = await prisma.user.findUnique({ where: { suiteUserId: "suite-test-2" } });
    expect(u?.aktiv).toBe(false);
  });

  it("Tombstone: DELETE sperrt, loescht nicht", async () => {
    await anmeldeCookie(app);
    await request(app)
      .delete("/api/provision/user/suite-test-1")
      .set("X-Provision-Secret", PROVISION_SECRET)
      .expect(200);
    const u = await prisma.user.findUnique({ where: { suiteUserId: "suite-test-1" } });
    expect(u?.geloescht).toBe(true);
    expect(u?.aktiv).toBe(false);
  });
});
