import { prisma } from "./db.js";

// Prueft, dass jedes angegebene Konto existiert, aktiv und dem Bereich der
// Kostenstelle freigegeben ist. Ergebnis-Objekt statt Exception, damit die
// Routen sauber mit 400 antworten koennen.
export async function pruefeKontenFreigabe(
  kostenstelleId: number,
  kontoIds: number[]
): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const ks = await prisma.kostenstelle.findUnique({
    where: { id: kostenstelleId },
    select: { bereichId: true },
  });
  if (!ks) return { ok: false, fehler: "Kostenstelle nicht gefunden." };

  const eindeutig = [...new Set(kontoIds)];
  const konten = await prisma.konto.findMany({
    where: { id: { in: eindeutig } },
    select: {
      id: true,
      nummer: true,
      aktiv: true,
      bereiche: { where: { bereichId: ks.bereichId }, select: { bereichId: true } },
    },
  });
  const perId = new Map(konten.map((k) => [k.id, k]));

  for (const id of eindeutig) {
    const k = perId.get(id);
    if (!k) return { ok: false, fehler: `Konto (ID ${id}) nicht gefunden.` };
    if (!k.aktiv) return { ok: false, fehler: `Konto ${k.nummer} ist deaktiviert.` };
    if (k.bereiche.length === 0) {
      return { ok: false, fehler: `Konto ${k.nummer} ist fuer diesen Bereich nicht freigegeben.` };
    }
  }
  return { ok: true };
}
