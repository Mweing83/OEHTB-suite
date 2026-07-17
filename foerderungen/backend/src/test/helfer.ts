import request from "supertest";
import type { Express } from "express";
import { prisma } from "../lib/prisma";

// Von setup.ts gesetzt; hier fuer die Tests zugaenglich gemacht.
export const PROVISION_SECRET = process.env.PROVISION_SECRET as string;

// Leert alle Tabellen (Integrationstests teilen sich die Test-DB).
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE audit_log, "Ausschreibung", "Foerderquelle", "ScanLauf",
      "User", "Einstellung"
    RESTART IDENTITY CASCADE;
  `);
}

// Provisioniert einen Test-Nutzer und liefert einen gueltigen suite_token-
// Cookie-Header (signiert mit dem Test-JWT_SECRET) fuer authentifizierte Calls.
export async function anmeldeCookie(app: Express): Promise<string[]> {
  await request(app)
    .put("/api/provision/user")
    .set("X-Provision-Secret", PROVISION_SECRET)
    .send({
      suiteUserId: "suite-test-1",
      benutzername: "test",
      name: "Test Nutzer",
      email: null,
      aktiv: true,
      rolle: "nutzer",
    })
    .expect(200);

  const jwt = await import("jsonwebtoken");
  const token = jwt.default.sign(
    {
      sub: "suite-test-1",
      benutzername: "test",
      name: "Test Nutzer",
      zugriff: { foerderungen: "nutzer" },
      letzteAktivitaet: Date.now(),
      geprueftAm: Date.now(),
    },
    process.env.JWT_SECRET as string,
    { expiresIn: "12h" }
  );
  return [`suite_token=${token}`];
}
