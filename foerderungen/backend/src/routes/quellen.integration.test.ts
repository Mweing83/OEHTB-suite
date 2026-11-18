import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { resetDb, anmeldeCookie } from "../test/helfer";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("Foerderquellen-Routen", () => {
  let cookie: string[];

  beforeEach(async () => {
    await resetDb();
    cookie = await anmeldeCookie(app);
  });

  it("verlangt Anmeldung", async () => {
    const res = await request(app).get("/api/quellen");
    expect(res.status).toBe(401);
  });

  it("legt eine Quelle an und listet sie", async () => {
    const neu = await request(app).post("/api/quellen").set("Cookie", cookie).send({
      name: "FSW – Tagesstruktur",
      traeger: "Fonds Soziales Wien",
      ebene: "LAND",
      kategorie: "KERNGESCHAEFT",
      themen: ["Behindertenhilfe"],
      beschreibung: "Leistungsfinanzierung Tagesstruktur",
      webseite: "https://www.fsw.at",
    });
    expect(neu.status).toBe(201);
    expect(neu.body.status).toBe("AKTIV");

    const liste = await request(app).get("/api/quellen").set("Cookie", cookie);
    expect(liste.status).toBe(200);
    expect(liste.body).toHaveLength(1);
    expect(liste.body[0].name).toBe("FSW – Tagesstruktur");
  });

  it("filtert nach status und ebene", async () => {
    await prisma.foerderquelle.createMany({
      data: [
        { name: "A", traeger: "T", ebene: "BUND", kategorie: "PROJEKT" },
        { name: "B", traeger: "T", ebene: "EU", kategorie: "PROJEKT", status: "VORGESCHLAGEN" },
      ],
    });
    const nurBund = await request(app)
      .get("/api/quellen?ebene=BUND")
      .set("Cookie", cookie);
    expect(nurBund.body).toHaveLength(1);
    const nurVorschlag = await request(app)
      .get("/api/quellen?status=VORGESCHLAGEN")
      .set("Cookie", cookie);
    expect(nurVorschlag.body).toHaveLength(1);
    expect(nurVorschlag.body[0].name).toBe("B");
  });

  it("Freigeben: PATCH status VORGESCHLAGEN -> AKTIV", async () => {
    const q = await prisma.foerderquelle.create({
      data: { name: "Neu", traeger: "T", ebene: "PRIVAT", kategorie: "BEIDES", status: "VORGESCHLAGEN", quelleTyp: "SCAN" },
    });
    const res = await request(app)
      .patch(`/api/quellen/${q.id}`)
      .set("Cookie", cookie)
      .send({ status: "AKTIV" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("AKTIV");
  });

  it("leert Webseite, Kontakt und Beschreibung beim Aendern", async () => {
    const q = await prisma.foerderquelle.create({
      data: {
        name: "Quelle", traeger: "T", ebene: "LAND", kategorie: "PROJEKT", quelleTyp: "MANUELL",
        webseite: "https://example.org", kontakt: "Frau Muster", beschreibung: "alt",
      },
    });
    const aendern = (daten: object) => request(app).patch(`/api/quellen/${q.id}`).set("Cookie", cookie).send(daten);

    const leer = await aendern({ webseite: null, kontakt: "", beschreibung: "" });
    expect(leer.status).toBe(200);
    expect(leer.body).toMatchObject({ webseite: null, kontakt: null, beschreibung: "" });

    // Weglassen aendert nichts; ungueltige Links bleiben abgelehnt.
    await aendern({ webseite: "https://example.org/neu", kontakt: "Herr Beispiel" });
    const nurName = await aendern({ name: "Quelle neu" });
    expect(nurName.body).toMatchObject({ name: "Quelle neu", webseite: "https://example.org/neu", kontakt: "Herr Beispiel" });
    expect((await aendern({ webseite: "javascript:alert(1)" })).status).toBe(400);
    expect((await aendern({ webseite: "" })).body.webseite).toBeNull();
  });

  it("weist ungueltige Nutzlast ab", async () => {
    const res = await request(app).post("/api/quellen").set("Cookie", cookie).send({
      name: "", traeger: "T", ebene: "FALSCH", kategorie: "PROJEKT",
    });
    expect(res.status).toBe(400);
  });
});
