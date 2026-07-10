import { prisma } from "./db.js";

// Liest, ob beim Buchen ein Beleg verpflichtend ist (Standard: nein).
// Vom Administrator im Tab "Kassensperre" schaltbar.
export async function belegPflichtAktiv(): Promise<boolean> {
  const k = await prisma.allgemeinKonfig.findFirst({ orderBy: { id: "asc" } });
  return k?.belegPflicht ?? false;
}
