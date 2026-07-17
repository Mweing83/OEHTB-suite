import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ---- Admin-Benutzer ----
  const adminEmail = "admin@oehtb.local";
  const adminPasswort = "admin123"; // nach erstem Login aendern!
  const hash = await bcrypt.hash(adminPasswort, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwortHash: hash,
      name: "Administrator",
      rolle: "admin",
    },
  });
  console.log(`Admin angelegt: ${adminEmail} / ${adminPasswort}`);

  // ---- Beispiel-Mitarbeiter mit Beschaeftigungshistorie ----
  const mayer = await prisma.mitarbeiter.upsert({
    where: { personalnummer: "P-1001" },
    update: {},
    create: {
      vorname: "Anna",
      nachname: "Mayer",
      personalnummer: "P-1001",
      bereich: "VBW",
    },
  });

  // Nur anlegen, wenn noch keine Historie existiert
  const vorhanden = await prisma.beschaeftigung.count({
    where: { mitarbeiterId: mayer.id },
  });
  if (vorhanden === 0) {
    await prisma.beschaeftigung.createMany({
      data: [
        {
          mitarbeiterId: mayer.id,
          wochenstunden: 35,
          ausmassProzent: 87.5,
          gueltigAb: new Date("2024-01-01"),
          quelle: "MANUELL",
        },
        // Zukuenftige Aenderung – liegt schon in der DB, wird erst ab Datum aktiv
        {
          mitarbeiterId: mayer.id,
          wochenstunden: 30,
          ausmassProzent: 75,
          gueltigAb: new Date("2026-10-01"),
          quelle: "MANUELL",
        },
      ],
    });
  }

  await prisma.mitarbeiter.upsert({
    where: { personalnummer: "P-1002" },
    update: {},
    create: {
      vorname: "Thomas",
      nachname: "Huber",
      personalnummer: "P-1002",
      bereich: "GVB",
      beschaeftigungen: {
        create: {
          wochenstunden: 40,
          ausmassProzent: 100,
          gueltigAb: new Date("2023-06-01"),
          quelle: "MANUELL",
        },
      },
    },
  });

  console.log("Beispiel-Mitarbeiter angelegt.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
