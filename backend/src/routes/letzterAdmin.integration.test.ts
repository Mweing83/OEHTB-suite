import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { resetDb } from "../test/helfer";
import { passwortHashen, SUITE_COOKIE } from "../lib/auth";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Schutz "letzter Verwaltungs-Admin": entscheidend ist, ob AUSSER der
// betroffenen Person noch ein aktiver Admin uebrig bleibt.
run("Letzter Verwaltungs-Admin (Portal, Integration)", () => {
  let chef: string; // einziger aktiver Admin (handelt)
  let exAdmin: string; // deaktivierter frueherer Admin
  let cookie: string;

  async function admin(benutzername: string, aktiv: boolean, toolId: string): Promise<string> {
    const u = await prisma.suiteUser.create({
      data: {
        benutzername,
        name: benutzername,
        aktiv,
        passwortSetzen: false,
        passwortHash: await passwortHashen("geheim-passwort-1"),
      },
    });
    await prisma.zugriff.create({ data: { userId: u.id, toolId, rolle: "admin" } });
    return u.id;
  }

  beforeEach(async () => {
    await resetDb();
    const verwaltung = await prisma.tool.create({
      data: { slug: "verwaltung", name: "Verwaltung", pfad: "/", rollen: ["admin"] },
    });
    chef = await admin("chef", true, verwaltung.id);
    exAdmin = await admin("ex", false, verwaltung.id);
    const r = await request(app)
      .post("/api/suite/auth/login")
      .send({ benutzername: "chef", passwort: "geheim-passwort-1" });
    expect(r.status).toBe(200);
    const roh = (r.headers["set-cookie"] as unknown as string[]) ?? [];
    cookie = [...roh].reverse().find((c) => c.startsWith(`${SUITE_COOKIE}=`))!.split(";")[0];
  });

  const zugriffEntziehen = (id: string) =>
    request(app).put(`/api/suite/admin/benutzer/${id}/zugriff`).set("Cookie", cookie).send({ zugriff: { verwaltung: null } });

  it("ein deaktivierter Ex-Admin laesst sich entrechten", async () => {
    expect((await zugriffEntziehen(exAdmin)).status).toBe(200);
    expect(await prisma.zugriff.count({ where: { userId: exAdmin } })).toBe(0);
  });

  it("ein deaktivierter Ex-Admin laesst sich loeschen", async () => {
    const r = await request(app).delete(`/api/suite/admin/benutzer/${exAdmin}`).set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(await prisma.suiteUser.findUnique({ where: { id: exAdmin } })).toBeNull();
  });

  it("der einzige aktive Admin kann sich den Verwaltungszugriff nicht selbst nehmen", async () => {
    const r = await zugriffEntziehen(chef);
    expect(r.status).toBe(409);
    expect(await prisma.zugriff.count({ where: { userId: chef } })).toBe(1);
  });

  it("mit einem zweiten aktiven Admin darf der eigene Zugriff entzogen werden", async () => {
    await prisma.suiteUser.update({ where: { id: exAdmin }, data: { aktiv: true } });
    expect((await zugriffEntziehen(chef)).status).toBe(200);
  });
});
