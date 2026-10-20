import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { tokenSignieren } from "../lib/suiteAuth";
import { applyDelete, applyUpsert } from "../lib/provision";
import { resetDb } from "../test/helfer";

// Integrationstests laufen nur mit ausdruecklich gesetzter Testdatenbank.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Security-Audit 2026-10: Widerruf aus dem Portal muss im Tool ankommen.
const SUB = "suite-widerruf-1";

function cookieMitAltenRechten(): string {
  const jetzt = Date.now();
  const token = tokenSignieren({
    sub: SUB,
    benutzername: "ex.person",
    name: "Ex Person",
    zugriff: { foerderungen: "nutzer" },
    letzteAktivitaet: jetzt,
    geprueftAm: jetzt - 5 * 60 * 1000, // Rechte aelter als das Pruefintervall
  });
  return `suite_token=${token}`;
}

function portalAntwortet(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ fehler: "x" }), { status }))
  );
}

function portalNichtErreichbar() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    })
  );
}

const nutzlast = {
  suiteUserId: SUB,
  benutzername: "ex.person",
  name: "Ex Person",
  email: null,
  aktiv: true,
  rolle: "nutzer",
};

run("SSO-Widerruf und Tombstones (Förderungen, Integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("401 des Portals beendet die Sitzung und legt keinen Spiegel an", async () => {
    portalAntwortet(401);
    const r = await request(app).get("/api/auth/me").set("Cookie", [cookieMitAltenRechten()]);
    expect(r.status).toBe(401);
    expect(String(r.headers["set-cookie"] ?? "")).toContain("suite_token=;");
    expect(await prisma.user.count({ where: { suiteUserId: SUB } })).toBe(0);
  });

  it("Portal nicht erreichbar: unbekannter Benutzer wird nicht angelegt (403)", async () => {
    portalNichtErreichbar();
    const r = await request(app).get("/api/auth/me").set("Cookie", [cookieMitAltenRechten()]);
    expect(r.status).toBe(403);
    expect(await prisma.user.count({ where: { suiteUserId: SUB } })).toBe(0);
  });

  it("Portal nicht erreichbar: bekannter aktiver Benutzer arbeitet weiter", async () => {
    await applyUpsert(nutzlast);
    portalNichtErreichbar();
    const r = await request(app).get("/api/auth/me").set("Cookie", [cookieMitAltenRechten()]);
    expect(r.status).toBe(200);
  });

  it("gesperrter Benutzer erhaelt kein frisches Token", async () => {
    await applyUpsert({ ...nutzlast, aktiv: false });
    portalNichtErreichbar();
    const r = await request(app).get("/api/auth/me").set("Cookie", [cookieMitAltenRechten()]);
    expect(r.status).toBe(403);
    expect(r.headers["set-cookie"]).toBeUndefined();
  });

  it("Tombstone fuer unbekannten Benutzer bleibt bestehen; veralteter Push nimmt ihn nicht zurueck", async () => {
    await applyDelete(SUB);
    let zeile = await prisma.user.findUniqueOrThrow({ where: { suiteUserId: SUB } });
    expect(zeile.geloescht).toBe(true);
    expect(zeile.aktiv).toBe(false);

    await applyUpsert(nutzlast); // veralteter Push
    zeile = await prisma.user.findUniqueOrThrow({ where: { suiteUserId: SUB } });
    expect(zeile.geloescht).toBe(true);
    expect(zeile.aktiv).toBe(false);

    portalNichtErreichbar();
    const r = await request(app).get("/api/auth/me").set("Cookie", [cookieMitAltenRechten()]);
    expect(r.status).toBe(403);

    // Nur der massgebliche Snapshot darf einen Tombstone zuruecknehmen.
    await applyUpsert(nutzlast, "snapshot");
    zeile = await prisma.user.findUniqueOrThrow({ where: { suiteUserId: SUB } });
    expect(zeile.geloescht).toBe(false);
  });
});
