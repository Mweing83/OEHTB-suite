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
      rollen: ["admin", "sachbearbeiter", "personalverrechnung", "leser"],
      reihenfolge: 2,
      provisionUrl: process.env.STUNDEN_URL ?? "http://stunden-app:3002",
    },
    {
      slug: "foerderungen",
      name: "Förderungen",
      beschreibung: "Österreichische Förderlandschaft und Ausschreibungsfristen im Blick",
      pfad: "/foerderungen/",
      rollen: ["nutzer"],
      reihenfolge: 3,
      provisionUrl: process.env.FOERDERUNGEN_URL ?? "http://foerderungen-app:3003",
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
  // Sicherheit: In Produktion existiert KEIN bekanntes Standard-Passwort. Der
  // Admin wird ohne nutzbares Passwort angelegt (passwortSetzen: true) und MUSS
  // beim ersten Login ein eigenes Passwort vergeben (siehe routes/auth.ts).
  // Nur fuer die lokale Entwicklung kann ueber ADMIN_INITIAL_PASSWORT ein
  // Startpasswort vorgegeben werden (das trotzdem beim ersten Login zu aendern
  // ist). upsert/update {}: ein bereits gesetztes Passwort wird bei erneutem
  // Seed (Redeploy) nie ueberschrieben.
  const initialPasswort = process.env.ADMIN_INITIAL_PASSWORT;
  const admin = await prisma.suiteUser.upsert({
    where: { benutzername: "admin" },
    update: {},
    create: {
      benutzername: "admin",
      name: "Administrator",
      passwortHash: initialPasswort ? await bcrypt.hash(initialPasswort, 10) : null,
      passwortSetzen: true,
      aktiv: true,
    },
  });

  // Admin bekommt beim ERSTSTART Zugriff auf alles. Bestehende Zugriffe
  // bleiben unangetastet (update: {}), sonst wuerde jeder Container-Start
  // manuell vergebene Rollen ueberschreiben.
  for (const t of tools) {
    const tool = await prisma.tool.findUnique({ where: { slug: t.slug } });
    if (!tool) continue;
    // Hoechste Rolle des Tools: "admin", wo es sie gibt, sonst die erste
    // Tool-Rolle (Foerderungen kennt z. B. nur "nutzer").
    const rolle = t.rollen.includes("admin") ? "admin" : t.rollen[0];
    await prisma.zugriff.upsert({
      where: { userId_toolId: { userId: admin.id, toolId: tool.id } },
      update: {},
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
