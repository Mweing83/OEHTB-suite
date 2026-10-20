import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { resetDb } from "../test/helfer";
import { einrichtungsCodeErzeugen } from "../lib/einrichtungscode";
import { passwortHashen, tokenSignieren, SUITE_COOKIE } from "../lib/auth";

// Integrationstests laufen nur mit ausdruecklich gesetzter Testdatenbank.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

async function kontoOhnePasswort(code = einrichtungsCodeErzeugen()) {
  const user = await prisma.suiteUser.create({
    data: {
      benutzername: "neu",
      name: "Neue Person",
      passwortSetzen: true,
      einrichtungsCodeHash: code.hash,
      einrichtungsCodeBis: code.bis,
    },
  });
  return { user, code };
}

function setzen(body: Record<string, unknown>) {
  return request(app).post("/api/suite/auth/passwort-setzen").send(body);
}

run("passwort-setzen braucht den Einrichtungscode (Portal, Integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lehnt ohne Code ab (400) und laesst das Konto unveraendert", async () => {
    const { user } = await kontoOhnePasswort();
    const r = await setzen({ benutzername: "neu", neuesPasswort: "geheim-123456" });
    expect(r.status).toBe(400);
    const u = await prisma.suiteUser.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.passwortHash).toBeNull();
    expect(u.passwortSetzen).toBe(true);
  });

  it("lehnt einen falschen Code ab (403)", async () => {
    await kontoOhnePasswort();
    const r = await setzen({
      benutzername: "neu",
      einrichtungsCode: einrichtungsCodeErzeugen().klartext,
      neuesPasswort: "geheim-123456",
    });
    expect(r.status).toBe(403);
  });

  it("lehnt einen abgelaufenen Code ab (403)", async () => {
    const c = einrichtungsCodeErzeugen(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
    await kontoOhnePasswort(c);
    const r = await setzen({
      benutzername: "neu",
      einrichtungsCode: c.klartext,
      neuesPasswort: "geheim-123456",
    });
    expect(r.status).toBe(403);
  });

  it("lehnt ab, wenn das Konto keinen Code hat (Altbestand) (403)", async () => {
    await prisma.suiteUser.create({
      data: { benutzername: "alt", name: "Alt", passwortSetzen: true },
    });
    const r = await setzen({
      benutzername: "alt",
      einrichtungsCode: "AAAA-BBBB-CCCC",
      neuesPasswort: "geheim-123456",
    });
    expect(r.status).toBe(403);
  });

  it("setzt mit richtigem Code das Passwort, der Code ist danach verbraucht", async () => {
    const { user, code } = await kontoOhnePasswort();
    const r = await setzen({
      benutzername: "neu",
      einrichtungsCode: code.klartext,
      neuesPasswort: "geheim-123456",
    });
    expect(r.status).toBe(200);

    const u = await prisma.suiteUser.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.passwortSetzen).toBe(false);
    expect(u.einrichtungsCodeHash).toBeNull();

    const login = await request(app)
      .post("/api/suite/auth/login")
      .send({ benutzername: "neu", passwort: "geheim-123456" });
    expect(login.status).toBe(200);

    const nochmal = await setzen({
      benutzername: "neu",
      einrichtungsCode: code.klartext,
      neuesPasswort: "anderes-123456",
    });
    expect(nochmal.status).toBe(403);
  });
});

run("Verwaltung stellt Einrichtungscodes aus (Portal, Integration)", () => {
  let cookie: string;

  beforeEach(async () => {
    await resetDb();
    const tool = await prisma.tool.create({
      data: { slug: "verwaltung", name: "Verwaltung", pfad: "/verwaltung", rollen: ["admin"] },
    });
    const chef = await prisma.suiteUser.create({
      data: {
        benutzername: "chef",
        name: "Chef",
        passwortSetzen: false,
        passwortHash: await passwortHashen("chef-passwort-1"),
      },
    });
    await prisma.zugriff.create({ data: { userId: chef.id, toolId: tool.id, rolle: "admin" } });
    const token = tokenSignieren({
      sub: chef.id,
      benutzername: "chef",
      name: "Chef",
      zugriff: { verwaltung: "admin" },
      tokenGeneration: 0,
    });
    cookie = `${SUITE_COOKIE}=${token}`;
  });

  it("Anlegen liefert einen Code, mit dem die Person ihr Passwort setzt", async () => {
    const r = await request(app)
      .post("/api/suite/admin/benutzer")
      .set("Cookie", cookie)
      .send({ benutzername: "Maria.M", name: "Maria M" });
    expect(r.status).toBe(201);
    expect(r.body.einrichtungsCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const s = await setzen({
      benutzername: "maria.m",
      einrichtungsCode: r.body.einrichtungsCode,
      neuesPasswort: "maria-123456",
    });
    expect(s.status).toBe(200);
  });

  it("Neuausstellung macht den alten Code ungueltig; Reset liefert wieder einen Code", async () => {
    const neu = await request(app)
      .post("/api/suite/admin/benutzer")
      .set("Cookie", cookie)
      .send({ benutzername: "otto", name: "Otto" });
    const erster = neu.body.einrichtungsCode as string;

    const zweiter = await request(app)
      .post(`/api/suite/admin/benutzer/${neu.body.id}/einrichtungscode`)
      .set("Cookie", cookie);
    expect(zweiter.status).toBe(200);

    const mitAltem = await setzen({
      benutzername: "otto",
      einrichtungsCode: erster,
      neuesPasswort: "otto-1234567",
    });
    expect(mitAltem.status).toBe(403);

    const mitNeuem = await setzen({
      benutzername: "otto",
      einrichtungsCode: zweiter.body.einrichtungsCode,
      neuesPasswort: "otto-1234567",
    });
    expect(mitNeuem.status).toBe(200);

    // Konto hat jetzt ein Passwort: Neuausstellung wird abgelehnt.
    const abgelehnt = await request(app)
      .post(`/api/suite/admin/benutzer/${neu.body.id}/einrichtungscode`)
      .set("Cookie", cookie);
    expect(abgelehnt.status).toBe(409);

    const reset = await request(app)
      .put(`/api/suite/admin/benutzer/${neu.body.id}`)
      .set("Cookie", cookie)
      .send({ passwortReset: true });
    expect(reset.status).toBe(200);
    expect(reset.body.einrichtungsCode).toMatch(/^[A-Z2-9]{4}-/);
  });

  it("Neuausstellung ohne Anmeldung wird abgelehnt", async () => {
    const r = await request(app).post("/api/suite/admin/benutzer/irgendwer/einrichtungscode");
    expect(r.status).toBe(401);
  });
});
