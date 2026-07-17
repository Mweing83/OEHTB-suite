import { prisma } from "../lib/prisma";

// Setzt offene Ausschreibungen mit ueberschrittener Frist auf ABGELAUFEN.
// Wird naechtlich vom Zeitplan (services/zeitplan.ts) und zu Beginn jedes
// Scans aufgerufen. Vorschlaege bleiben unberuehrt – sie werden im Pruef-
// Schritt entschieden.
//
// Datums-Semantik: "frist" ist eine @db.Date-Spalte; Prisma vergleicht auf
// UTC-Kalenderdatum. "Heute" muss deshalb das WIENER Kalenderdatum als
// UTC-Mitternacht sein – lokale Servermitternacht (setHours) oder
// UTC-Mitternacht (setUTCHours) kippen je nach Server-Zeitzone um einen Tag.
export async function markiereAbgelaufene(): Promise<number> {
  const wienerDatum = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
  }).format(new Date()); // liefert YYYY-MM-DD
  const heute = new Date(wienerDatum + "T00:00:00.000Z");
  const ergebnis = await prisma.ausschreibung.updateMany({
    where: {
      status: "OFFEN",
      laufendEinreichbar: false,
      frist: { not: null, lt: heute },
    },
    data: { status: "ABGELAUFEN" },
  });
  return ergebnis.count;
}
