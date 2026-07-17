import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { entschluesseln } from "../lib/krypto";
import { resetDb, anmeldeCookie } from "../test/helfer";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("Einstellungs-Routen", () => {
  let cookie: string[];

  beforeEach(async () => {
    await resetDb();
    cookie = await anmeldeCookie(app);
  });

  it("liefert Standardwerte ohne gespeicherte Konfiguration", async () => {
    const res = await request(app).get("/api/einstellungen").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.llm.provider).toBe("dummy");
    expect(res.body.llm.apiKeyGesetzt).toBe(false);
    expect(res.body.scan).toEqual({ aktiv: false, wochentag: 1, stunde: 6 });
  });

  it("speichert LLM-Konfiguration, Key verschluesselt und nie im Klartext zurueck", async () => {
    const put = await request(app).put("/api/einstellungen/llm").set("Cookie", cookie).send({
      provider: "anthropic",
      modell: "claude-sonnet-4-6",
      apiKey: "sk-test-geheim",
    });
    expect(put.status).toBe(200);

    const res = await request(app).get("/api/einstellungen").set("Cookie", cookie);
    expect(res.body.llm.provider).toBe("anthropic");
    expect(res.body.llm.apiKeyGesetzt).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("sk-test-geheim");

    const zeile = await prisma.einstellung.findUnique({ where: { schluessel: "llm_konfig" } });
    const wert = zeile!.wert as { apiKeyVerschluesselt: string };
    expect(wert.apiKeyVerschluesselt).not.toContain("sk-test-geheim");
    expect(entschluesseln(wert.apiKeyVerschluesselt)).toBe("sk-test-geheim");
  });

  it("behaelt gespeicherten Key, wenn beim Speichern kein neuer uebergeben wird", async () => {
    await request(app).put("/api/einstellungen/llm").set("Cookie", cookie).send({
      provider: "anthropic", apiKey: "sk-test-geheim",
    });
    await request(app).put("/api/einstellungen/llm").set("Cookie", cookie).send({
      provider: "anthropic", modell: "claude-opus-4-8",
    });
    const zeile = await prisma.einstellung.findUnique({ where: { schluessel: "llm_konfig" } });
    const wert = zeile!.wert as { apiKeyVerschluesselt: string; modell: string };
    expect(entschluesseln(wert.apiKeyVerschluesselt)).toBe("sk-test-geheim");
    expect(wert.modell).toBe("claude-opus-4-8");
  });

  it("speichert Scan-Zeitplan und validiert Grenzen", async () => {
    const ok = await request(app).put("/api/einstellungen/scan").set("Cookie", cookie).send({
      aktiv: true, wochentag: 1, stunde: 6,
    });
    expect(ok.status).toBe(200);
    const schlecht = await request(app).put("/api/einstellungen/scan").set("Cookie", cookie).send({
      aktiv: true, wochentag: 9, stunde: 6,
    });
    expect(schlecht.status).toBe(400);
  });
});
