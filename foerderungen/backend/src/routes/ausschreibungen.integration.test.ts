import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { resetDb, anmeldeCookie } from "../test/helfer";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("Ausschreibungs-Routen", () => {
  let cookie: string[];
  let quelleId: string;

  beforeEach(async () => {
    await resetDb();
    cookie = await anmeldeCookie(app);
    const q = await prisma.foerderquelle.create({
      data: { name: "Q", traeger: "T", ebene: "BUND", kategorie: "PROJEKT" },
    });
    quelleId = q.id;
  });

  it("legt eine Ausschreibung an und listet sie mit Quelle", async () => {
    const neu = await request(app).post("/api/ausschreibungen").set("Cookie", cookie).send({
      foerderquelleId: quelleId,
      titel: "Digitalisierungs-Call 2026",
      frist: "2026-10-31",
      foerderhoehe: "bis 50.000 EUR",
      link: "https://beispiel.at/call",
    });
    expect(neu.status).toBe(201);

    const liste = await request(app).get("/api/ausschreibungen").set("Cookie", cookie);
    expect(liste.body).toHaveLength(1);
    expect(liste.body[0].foerderquelle.name).toBe("Q");
  });

  it("Pruef-Ablauf: VORGESCHLAGEN -> OFFEN und -> ABGELEHNT", async () => {
    const a = await prisma.ausschreibung.create({
      data: { foerderquelleId: quelleId, titel: "Vorschlag", status: "VORGESCHLAGEN", quelleTyp: "SCAN" },
    });
    const frei = await request(app)
      .patch(`/api/ausschreibungen/${a.id}`)
      .set("Cookie", cookie)
      .send({ status: "OFFEN" });
    expect(frei.body.status).toBe("OFFEN");

    const b = await prisma.ausschreibung.create({
      data: { foerderquelleId: quelleId, titel: "Vorschlag 2", status: "VORGESCHLAGEN", quelleTyp: "SCAN" },
    });
    const abgelehnt = await request(app)
      .patch(`/api/ausschreibungen/${b.id}`)
      .set("Cookie", cookie)
      .send({ status: "ABGELEHNT" });
    expect(abgelehnt.body.status).toBe("ABGELEHNT");
  });

  it("Aktualisierungsvorschlag uebernehmen: Felder wandern, Vorschlag verschwindet", async () => {
    const original = await prisma.ausschreibung.create({
      data: {
        foerderquelleId: quelleId,
        titel: "Call",
        frist: new Date("2026-09-30"),
        status: "OFFEN",
      },
    });
    const vorschlag = await prisma.ausschreibung.create({
      data: {
        foerderquelleId: quelleId,
        titel: "Call",
        frist: new Date("2026-11-30"),
        status: "VORGESCHLAGEN",
        quelleTyp: "SCAN",
        aktualisiertAusschreibungId: original.id,
      },
    });

    const res = await request(app)
      .patch(`/api/ausschreibungen/${vorschlag.id}`)
      .set("Cookie", cookie)
      .send({ status: "OFFEN" });
    expect(res.status).toBe(200);
    // Antwort ist die AKTUALISIERTE Bestandszeile.
    expect(res.body.id).toBe(original.id);
    expect(res.body.frist.startsWith("2026-11-30")).toBe(true);

    const nochDa = await prisma.ausschreibung.findUnique({ where: { id: vorschlag.id } });
    expect(nochDa).toBeNull();
  });

  it("weist ungueltige Quelle ab", async () => {
    const res = await request(app).post("/api/ausschreibungen").set("Cookie", cookie).send({
      foerderquelleId: "gibt-es-nicht",
      titel: "X",
    });
    expect(res.status).toBe(400);
  });
});
