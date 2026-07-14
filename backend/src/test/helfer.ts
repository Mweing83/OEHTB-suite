import { prisma } from "../lib/prisma";

// Von setup.ts gesetzt; hier fuer die Tests zugaenglich gemacht.
export const PROVISION_SECRET = process.env.PROVISION_SECRET as string;

// Leert alle Tabellen und setzt Auto-IDs zurueck. audit_log ist per Trigger
// gegen UPDATE/DELETE geschuetzt; TRUNCATE bleibt erlaubt (Statement-Ebene).
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE zugriff, provision_outbox, audit_log, suite_user, tool
    RESTART IDENTITY CASCADE;
  `);
}

// Legt ein Tool mit einem berechtigten Benutzer an (fuer den Snapshot-Test).
export async function seedToolMitUser() {
  const tool = await prisma.tool.create({
    data: {
      slug: "handkassen",
      name: "Handkassen",
      pfad: "/handkassen/",
      rollen: ["erfasser", "leitung", "finanzen", "admin"],
    },
  });
  const user = await prisma.suiteUser.create({
    data: { benutzername: "testuser", name: "Test User", email: null, aktiv: true },
  });
  await prisma.zugriff.create({
    data: { userId: user.id, toolId: tool.id, rolle: "erfasser" },
  });
  return { tool, user };
}
