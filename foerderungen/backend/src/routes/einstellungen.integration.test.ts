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
    expect(res.body.scan).toEqual({
      ueberwachung: { aktiv: false, wochentag: 1, stunde: 6 },
      entdeckung: { aktiv: false, tag: 1, stunde: 7 },
    });
  });

  it("versteht das alte flache Scan-Format (Migration)", async () => {
    await prisma.einstellung.create({
      data: { schluessel: "scan_konfig", wert: { aktiv: true, wochentag: 3, stunde: 5 } },
    });
    const res = await request(app).get("/api/einstellungen").set("Cookie", cookie);
    expect(res.body.scan.ueberwachung).toEqual({ aktiv: true, wochentag: 3, stunde: 5 });
    expect(res.body.scan.entdeckung.aktiv).toBe(false);
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

  it("verwirft den Key beim Anbieterwechsel ohne neuen Key (Security-Audit 2026-10)", async () => {
    const { ladeProviderKonfig } = await import("../services/llm/factory");
    await request(app).put("/api/einstellungen/llm").set("Cookie", cookie).send({
      provider: "anthropic", apiKey: "sk-ant-geheim",
    });
    await request(app).put("/api/einstellungen/llm").set("Cookie", cookie).send({ provider: "openai" });
    const res = await request(app).get("/api/einstellungen").set("Cookie", cookie);
    expect(res.body.llm.apiKeyGesetzt).toBe(false);
    expect((await ladeProviderKonfig()).apiKey).toBeUndefined();
  });

  it("nutzt einen Altbestand-Key nur fuer den eingestellten Anbieter", async () => {
    const { ladeProviderKonfig } = await import("../services/llm/factory");
    await request(app).put("/api/einstellungen/llm").set("Cookie", cookie).send({
      provider: "anthropic", apiKey: "sk-ant-geheim",
    });
    // Altbestand simulieren: Feld apiKeyProvider fehlt, Anbieter manuell geaendert.
    const zeile = await prisma.einstellung.findUniqueOrThrow({ where: { schluessel: "llm_konfig" } });
    const wert = { ...(zeile.wert as Record<string, unknown>) };
    delete wert.apiKeyProvider;
    await prisma.einstellung.update({ where: { schluessel: "llm_konfig" }, data: { wert: wert as object } });
    expect((await ladeProviderKonfig()).apiKey).toBe("sk-ant-geheim");

    await prisma.einstellung.update({
      where: { schluessel: "llm_konfig" },
      data: { wert: { ...wert, provider: "openai", apiKeyProvider: "anthropic" } },
    });
    expect((await ladeProviderKonfig()).apiKey).toBeUndefined();
  });

  it("loescht den Key auf ausdruecklichen Wunsch", async () => {
    await request(app).put("/api/einstellungen/llm").set("Cookie", cookie).send({
      provider: "anthropic", apiKey: "sk-ant-geheim",
    });
    await request(app).put("/api/einstellungen/llm").set("Cookie", cookie).send({
      provider: "anthropic", apiKeyLoeschen: true,
    });
    const res = await request(app).get("/api/einstellungen").set("Cookie", cookie);
    expect(res.body.llm.apiKeyGesetzt).toBe(false);
  });

  it("speichert Scan-Zeitplan (beide Arten) und validiert Grenzen", async () => {
    const ok = await request(app).put("/api/einstellungen/scan").set("Cookie", cookie).send({
      ueberwachung: { aktiv: true, wochentag: 1, stunde: 6 },
      entdeckung: { aktiv: true, tag: 15, stunde: 7 },
    });
    expect(ok.status).toBe(200);

    const res = await request(app).get("/api/einstellungen").set("Cookie", cookie);
    expect(res.body.scan.entdeckung).toEqual({ aktiv: true, tag: 15, stunde: 7 });

    const schlechterWochentag = await request(app).put("/api/einstellungen/scan").set("Cookie", cookie).send({
      ueberwachung: { aktiv: true, wochentag: 9, stunde: 6 },
      entdeckung: { aktiv: false, tag: 1, stunde: 7 },
    });
    expect(schlechterWochentag.status).toBe(400);

    const schlechterTag = await request(app).put("/api/einstellungen/scan").set("Cookie", cookie).send({
      ueberwachung: { aktiv: false, wochentag: 1, stunde: 6 },
      entdeckung: { aktiv: true, tag: 31, stunde: 7 },
    });
    expect(schlechterTag.status).toBe(400);
  });
});
