import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../server.js";
import { prisma } from "../lib/db.js";
import { provisionSecret } from "../lib/provision.js";
import { SUITE_COOKIE, TOOL_SLUG, tokenSignieren } from "../lib/suiteAuth.js";
import { resetDb, seedBasis, type Basis } from "../test/helfer.js";

// Integrationstests laufen nur, wenn ausdrücklich eine Testdatenbank gesetzt ist.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Sicherheits-Regression (Audit 2026-10): Ein NEUER Suite-Benutzer, der nur
// zufällig denselben Benutzernamen wie eine unverknüpfte Bestandszeile hat,
// darf deren Kostenstellen-Freischaltungen nicht erben.
function tokenFuer(sub: string, benutzername: string, rolle: string) {
  const jetzt = Date.now();
  return tokenSignieren({
    sub,
    benutzername,
    name: "Neue Person",
    zugriff: { [TOOL_SLUG]: rolle },
    letzteAktivitaet: jetzt,
    geprueftAm: jetzt,
  });
}

run("Übernahme gleichnamiger Bestandszeilen (Integration)", () => {
  let basis: Basis;

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
    // Bestandszeilen aus der Zeit vor dem Suite-Login: noch nicht verknuepft.
    await prisma.benutzer.updateMany({
      where: { id: { in: [basis.benutzer.erfasserA, basis.benutzer.leitungA] } },
      data: { suiteUserId: null },
    });
  });

  it("Anmeldung: verknüpft die Altzeile, entfernt aber ihre Freischaltungen und protokolliert", async () => {
    // 'erfasser' ist unverknüpft (beforeEach) und für ksA freigeschaltet.
    const token = tokenFuer("suite-neue-person", "erfasser", "erfasser");

    const r = await request(app)
      .get(`/api/kostenstellen/${basis.ksA}`)
      .set("Cookie", [`${SUITE_COOKIE}=${token}`]);
    expect(r.status).toBe(403);

    const zeile = await prisma.benutzer.findUniqueOrThrow({ where: { id: basis.benutzer.erfasserA } });
    expect(zeile.suiteUserId).toBe("suite-neue-person");
    expect(await prisma.benutzerKostenstelle.count({ where: { benutzerId: zeile.id } })).toBe(0);

    const eintrag = await prisma.auditLog.findFirst({
      where: { aktion: "benutzer.altzeile_verknuepft", entitaetId: zeile.id },
    });
    expect(eintrag).not.toBeNull();
    expect(eintrag!.alteWerte).toMatchObject({ kostenstellen: [basis.ksA] });
  });

  it("Provisionierung: verknüpft die Altzeile ohne Freischaltungen, aktiv kommt vom Portal", async () => {
    await prisma.benutzer.update({ where: { id: basis.benutzer.leitungA }, data: { aktiv: false } });

    const r = await request(app)
      .put("/api/provision/user")
      .set("X-Provision-Secret", provisionSecret())
      .send({
        suiteUserId: "suite-neu-leitung",
        benutzername: "leitung",
        name: "Neue Leitung",
        email: null,
        aktiv: true,
        rolle: "leitung",
      });
    expect(r.status).toBe(200);

    const zeile = await prisma.benutzer.findUniqueOrThrow({ where: { id: basis.benutzer.leitungA } });
    expect(zeile.suiteUserId).toBe("suite-neu-leitung");
    expect(zeile.aktiv).toBe(true);
    expect(await prisma.benutzerKostenstelle.count({ where: { benutzerId: zeile.id } })).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { aktion: "benutzer.altzeile_verknuepft", entitaetId: zeile.id },
      })
    ).toBe(1);
  });

  it("bereits verknüpfte Benutzer behalten ihre Freischaltungen", async () => {
    await prisma.benutzer.update({
      where: { id: basis.benutzer.erfasserA },
      data: { suiteUserId: "suite-erfasser" },
    });
    const token = tokenFuer("suite-erfasser", "erfasser", "erfasser");
    const r = await request(app)
      .get(`/api/kostenstellen/${basis.ksA}`)
      .set("Cookie", [`${SUITE_COOKIE}=${token}`]);
    expect(r.status).toBe(200);
    expect(
      await prisma.benutzerKostenstelle.count({ where: { benutzerId: basis.benutzer.erfasserA } })
    ).toBe(1);
  });
});
