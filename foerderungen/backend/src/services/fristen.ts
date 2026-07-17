import { prisma } from "../lib/prisma";

// Setzt offene Ausschreibungen mit ueberschrittener Frist auf ABGELAUFEN.
// Wird naechtlich vom Zeitplan (services/zeitplan.ts) und zu Beginn jedes
// Scans aufgerufen. Vorschlaege bleiben unberuehrt – sie werden im Pruef-
// Schritt entschieden.
export async function markiereAbgelaufene(): Promise<number> {
  const heute = new Date();
  heute.setUTCHours(0, 0, 0, 0);
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
