import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Seed: Tool-Registry + ein Admin-Benutzer fuer den Erststart.
// Passwort "admin123" ist NUR fuer die Entwicklung – vor Produktivbetrieb
// aendern (siehe CHECKLISTE/INSTALL).

const prisma = new PrismaClient();

async function main() {
  // ---- Tool-Registry -------------------------------------------------------
  const tools = [
    {
      slug: "verwaltung",
      name: "Verwaltung",
      beschreibung: "Benutzer und Zugriffsrechte der Suite verwalten",
      pfad: "/verwaltung",
      rollen: ["admin"],
      reihenfolge: 99,
      // Kein eigenes Tool-Backend -> keine Provisionierung.
      provisionUrl: null as string | null,
    },
    {
      slug: "handkassen",
      name: "Handkassen",
      beschreibung: "Revisionssichere Erfassung und Kontrolle der Handkassen",
      pfad: "/handkassen/",
      rollen: ["erfasser", "leitung", "finanzen", "admin"],
      reihenfolge: 1,
      // Interne Docker-Netz-URL des Handkassen-Backends.
      provisionUrl: process.env.HANDKASSEN_URL ?? "http://handkassen-app:3001",
    },
    {
      slug: "stunden",
      name: "Stunden",
      beschreibung: "Wochenstunden und Beschäftigungsausmaß verwalten",
      pfad: "/stunden/",
      rollen: ["ADMIN", "SACHBEARBEITER", "PERSONALVERRECHNUNG", "LESER"],
      reihenfolge: 2,
      provisionUrl: process.env.STUNDEN_URL ?? "http://stunden-app:3002",
    },
  ];

  for (const t of tools) {
    await prisma.tool.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name,
        beschreibung: t.beschreibung,
        pfad: t.pfad,
        rollen: t.rollen,
        reihenfolge: t.reihenfolge,
        provisionUrl: t.provisionUrl,
      },
      create: { ...t, rollen: t.rollen },
    });
  }

  // ---- Admin-Benutzer ------------------------------------------------------
  const hash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.suiteUser.upsert({
    where: { benutzername: "admin" },
    update: {},
    create: {
      benutzername: "admin",
      name: "Administrator",
      passwortHash: hash,
      passwortSetzen: false,
      aktiv: true,
    },
  });

  // Admin bekommt Zugriff auf alles.
  for (const t of tools) {
    const tool = await prisma.tool.findUnique({ where: { slug: t.slug } });
    if (!tool) continue;
    const rolle = t.slug === "stunden" ? "ADMIN" : "admin";
    await prisma.zugriff.upsert({
      where: { userId_toolId: { userId: admin.id, toolId: tool.id } },
      update: { rolle },
      create: { userId: admin.id, toolId: tool.id, rolle },
    });
  }

  console.log("Seed fertig: Tools registriert, Benutzer 'admin' angelegt.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
