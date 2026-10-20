import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomInt } from "node:crypto";

// Seed: Tool-Registry + ein Admin-Benutzer fuer den Erststart.
// Es gibt KEIN Standard-Passwort: Solange der Admin sein Passwort nicht
// gesetzt hat, gibt jeder Start einen neuen Einrichtungscode im Container-Log
// aus (docker compose logs portal-app).

// Einrichtungscode – gleiche Logik wie src/lib/einrichtungscode.ts (der Seed
// laeuft im Image ohne src/, daher bewusst dupliziert; Format und Hash
// muessen identisch bleiben).
const CODE_ZEICHEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_GUELTIG_TAGE = 7;
function einrichtungsCodeErzeugen() {
  let roh = "";
  for (let i = 0; i < 12; i++) roh += CODE_ZEICHEN[randomInt(CODE_ZEICHEN.length)];
  return {
    klartext: roh.match(/.{4}/g)!.join("-"),
    hash: createHash("sha256").update(roh).digest("hex"),
    bis: new Date(Date.now() + CODE_GUELTIG_TAGE * 24 * 60 * 60 * 1000),
  };
}

// Demo-Konten der Handkassen (handkassen/backend/prisma/seed.ts, nur
// Entwicklung). Wurden sie per scripts/import.ts ins Portal uebernommen,
// waeren die im Repository stehenden Passwoerter gueltige Suite-Logins.
const DEMO_KONTEN: Record<string, string> = {
  admin: "admin123",
  leitung: "leitung123",
  erfasser: "erfass123",
};

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
  // beim ersten Login ein eigenes Passwort vergeben (siehe routes/auth.ts) –
  // mit dem Einrichtungscode, den dieser Seed weiter unten ins Log schreibt.
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

  // Uebernommene Demo-Passwoerter entschaerfen: Hat ein Portal-Konto noch das
  // Passwort eines Handkassen-Demo-Kontos, wird es zurueckgesetzt (Passwort
  // muss mit Einrichtungscode der Verwaltung neu gesetzt werden).
  for (const [benutzername, demoPasswort] of Object.entries(DEMO_KONTEN)) {
    const u = await prisma.suiteUser.findUnique({ where: { benutzername } });
    if (!u?.passwortHash) continue;
    if (!(await bcrypt.compare(demoPasswort, u.passwortHash))) continue;
    await prisma.suiteUser.update({
      where: { id: u.id },
      data: {
        passwortHash: null,
        passwortSetzen: true,
        einrichtungsCodeHash: null,
        einrichtungsCodeBis: null,
      },
    });
    console.warn(
      `WARNUNG: Konto '${benutzername}' hatte ein Demo-Passwort aus dem Repository – ` +
        "Passwort zurueckgesetzt. Bei Bedarf in der Verwaltung einen Einrichtungscode ausstellen oder das Konto deaktivieren."
    );
  }

  // Solange der Admin sein Passwort nicht gesetzt hat: neuen Einrichtungscode
  // ausstellen und ins Log schreiben (der vorherige wird ungueltig). Nur wer
  // Zugriff auf den Server/die Container-Logs hat, kann den Admin einrichten.
  const adminJetzt = await prisma.suiteUser.findUniqueOrThrow({ where: { id: admin.id } });
  if (adminJetzt.aktiv && adminJetzt.passwortSetzen) {
    const code = einrichtungsCodeErzeugen();
    await prisma.suiteUser.update({
      where: { id: admin.id },
      data: { einrichtungsCodeHash: code.hash, einrichtungsCodeBis: code.bis },
    });
    console.log("============================================================");
    console.log(" Erstanmeldung 'admin': Einrichtungscode " + code.klartext);
    console.log(
      " Gueltig bis " + code.bis.toISOString() + " (jeder Neustart erzeugt einen neuen)."
    );
    console.log("============================================================");
  }

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
