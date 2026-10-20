import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { applyUpsert } from "../lib/provision";
import { tokenSignieren } from "../lib/suiteAuth";
import { resetDb } from "../test/helfer";

// Integrationstests laufen nur mit ausdruecklich gesetzter Testdatenbank.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Security-Audit 2026-10: Bestaetigen/Ablehnen nur aus offenen Zustaenden.
run("Anfragen: Statusmaschine (Stunden, Integration)", () => {
  let cookie: string;
  let mitarbeiterId: string;

  beforeEach(async () => {
    await resetDb();
    await applyUpsert({
      suiteUserId: "suite-sb",
      benutzername: "sb",
      name: "Sachbearbeitung",
      email: null,
      aktiv: true,
      rolle: "sachbearbeiter",
    });
    const jetzt = Date.now();
    cookie = `suite_token=${tokenSignieren({
      sub: "suite-sb",
      benutzername: "sb",
      name: "Sachbearbeitung",
      zugriff: { stunden: "sachbearbeiter" },
      letzteAktivitaet: jetzt,
      geprueftAm: jetzt,
    })}`;
    const m = await prisma.mitarbeiter.create({
      data: { vorname: "Eva", nachname: "Test", personalnummer: "4711" },
    });
    mitarbeiterId = m.id;
  });

  async function anfrage(status: "ZUR_BESTAETIGUNG" | "VERARBEITET" | "ABGELEHNT") {
    return prisma.aenderungsanfrage.create({
      data: { rohtext: "Eva Test 20h ab 1.6.", quelle: "PASTE", status },
    });
  }

  const werte = () => ({ mitarbeiterId, wochenstunden: 20, ausmassProzent: 50, gueltigAb: "2026-06-01" });

  it("bestaetigt eine offene Anfrage genau einmal", async () => {
    const a = await anfrage("ZUR_BESTAETIGUNG");
    const r1 = await request(app).post(`/api/anfragen/${a.id}/bestaetigen`).set("Cookie", cookie).send(werte());
    expect(r1.status).toBe(200);
    const r2 = await request(app).post(`/api/anfragen/${a.id}/bestaetigen`).set("Cookie", cookie).send(werte());
    expect(r2.status).toBe(409);
    expect(await prisma.beschaeftigung.count({ where: { aenderungsanfrageId: a.id } })).toBe(1);
  });

  it("verarbeitete oder abgelehnte Anfragen lassen sich nicht erneut bestaetigen oder ablehnen", async () => {
    for (const status of ["VERARBEITET", "ABGELEHNT"] as const) {
      const a = await anfrage(status);
      const b = await request(app).post(`/api/anfragen/${a.id}/bestaetigen`).set("Cookie", cookie).send(werte());
      expect(b.status).toBe(409);
      const ab = await request(app).post(`/api/anfragen/${a.id}/ablehnen`).set("Cookie", cookie).send({ grund: "x" });
      expect(ab.status).toBe(409);
      const nachher = await prisma.aenderungsanfrage.findUniqueOrThrow({ where: { id: a.id } });
      expect(nachher.status).toBe(status);
    }
    expect(await prisma.beschaeftigung.count()).toBe(0);
  });

  it("Statusfilter nimmt nur feste Statuswerte an", async () => {
    await anfrage("VERARBEITET");
    const ok = await request(app).get("/api/anfragen?status=VERARBEITET").set("Cookie", cookie);
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveLength(1);
    const quatsch = await request(app).get("/api/anfragen?status=QUATSCH").set("Cookie", cookie);
    expect(quatsch.status).toBe(400);
    // Verschachtelte Filter duerfen nie als Prisma-Objekt durchgehen. Express 5
    // parst sie gar nicht mehr (einfacher Query-Parser) -> Standardliste ohne
    // die verarbeitete Anfrage; ein 400 waere ebenso sicher.
    for (const q of ["status[not]=NEU", "status[in][]=VERARBEITET"]) {
      const r = await request(app).get(`/api/anfragen?${q}`).set("Cookie", cookie);
      expect([200, 400]).toContain(r.status);
      if (r.status === 200) {
        expect(r.body.some((x: { status: string }) => x.status === "VERARBEITET")).toBe(false);
      }
    }
  });

  it("unbekannte Anfrage beim Ablehnen -> 404", async () => {
    const r = await request(app).post("/api/anfragen/gibtsnicht/ablehnen").set("Cookie", cookie).send({});
    expect(r.status).toBe(404);
  });
});
