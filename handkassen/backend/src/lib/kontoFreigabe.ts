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
    select: { bereichId: true, firmaId: true },
  });
  if (!ks) return { ok: false, fehler: "Kostenstelle nicht gefunden." };

  const eindeutig = [...new Set(kontoIds)];
  const konten = await prisma.konto.findMany({
    where: { id: { in: eindeutig } },
    select: {
      id: true,
      nummer: true,
      aktiv: true,
      firmaId: true,
      bereiche: { where: { bereichId: ks.bereichId }, select: { bereichId: true } },
    },
  });
  const perId = new Map(konten.map((k) => [k.id, k]));

  for (const id of eindeutig) {
    const k = perId.get(id);
    if (!k) return { ok: false, fehler: `Konto (ID ${id}) nicht gefunden.` };
    if (!k.aktiv) return { ok: false, fehler: `Konto ${k.nummer} ist deaktiviert.` };
    // Kontenplan je Firma: kein Konto einer anderen Firma bebuchen.
    if (k.firmaId !== ks.firmaId) {
      return { ok: false, fehler: `Konto ${k.nummer} gehört nicht zur Firma dieser Kostenstelle.` };
    }
    if (k.bereiche.length === 0) {
      return { ok: false, fehler: `Konto ${k.nummer} ist fuer diesen Bereich nicht freigegeben.` };
    }
  }
  return { ok: true };
}

// Konten mit fixem Steuersatz (z. B. Dotation 0 %): jede Position auf einem
// solchen Konto muss genau diesen Satz tragen (Key-User-Feedback 2026-11).
export async function pruefeFixSteuersaetze(
  positionen: { kontoId: number; steuersatz: number }[]
): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const konten = await prisma.konto.findMany({
    where: { id: { in: [...new Set(positionen.map((p) => p.kontoId))] }, fixSteuersatz: { not: null } },
    select: { id: true, nummer: true, fixSteuersatz: true },
  });
  const fix = new Map(konten.map((k) => [k.id, k]));
  for (const p of positionen) {
    const k = fix.get(p.kontoId);
    if (k && Number(k.fixSteuersatz) !== p.steuersatz) {
      return {
        ok: false,
        fehler: `Konto ${k.nummer} hat den fixen Steuersatz ${Number(k.fixSteuersatz)} %.`,
      };
    }
  }
  return { ok: true };
}
