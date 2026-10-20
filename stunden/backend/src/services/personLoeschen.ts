import type { Prisma } from "../generated/prisma/client";
import { namensVarianten, regexEscape } from "./pseudonym";

// ---------------------------------------------------------------------------
// DSGVO Art. 17: Person aus allen Aenderungsanfragen entfernen.
//
// Anfragen haengen nicht per Fremdschluessel am Mitarbeiter, sondern tragen
// Kopien: den Klartext (rohtext), das Pseudonym-Mapping (Platzhalter -> ID)
// und parseErgebnis.mitarbeiterId. Bei einer Loeschung muessen alle diese
// Kopien bereinigt werden (Security-Audit 2026-10) – sonst bliebe der Name fuer
// jede Rolle lesbar.
//
// Ersetzt Namensvarianten, E-Mail und Personalnummer im Rohtext durch den
// bisherigen Platzhalter der Person (bzw. PERSON_GELOESCHT), entfernt den
// Mapping-Eintrag und die mitarbeiterId. Liefert die Anzahl bereinigter Anfragen.
// ---------------------------------------------------------------------------
export async function personAusAnfragenEntfernen(
  tx: Prisma.TransactionClient,
  person: { id: string; vorname: string; nachname: string; email: string | null; personalnummer: string }
): Promise<number> {
  const anfragen = await tx.aenderungsanfrage.findMany({
    select: { id: true, rohtext: true, pseudonymMapping: true, parseErgebnis: true },
  });

  const suchbegriffe = [
    ...namensVarianten(person.vorname, person.nachname),
    // Vorname allein nur bei der Loeschung (lieber zu viel als zu wenig).
    ...(person.vorname.trim().length >= 3 ? [person.vorname.trim()] : []),
    ...(person.email ? [person.email] : []),
    person.personalnummer,
  ]
    .filter((s) => s.trim().length > 0)
    // Laengste zuerst: E-Mail/Vollname vor Nachname, sonst bleiben Reste stehen.
    .sort((a, b) => b.length - a.length);

  let bereinigt = 0;
  for (const a of anfragen) {
    const mapping = { ...((a.pseudonymMapping as Record<string, string> | null) ?? {}) };
    const ergebnis = (a.parseErgebnis as Record<string, unknown> | null) ?? null;

    const platzhalter =
      Object.entries(mapping).find(([, id]) => id === person.id)?.[0] ?? "PERSON_GELOESCHT";

    let text = a.rohtext;
    for (const begriff of suchbegriffe) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${regexEscape(begriff)}(?![\\p{L}\\p{N}])`, "giu");
      text = text.replace(re, platzhalter);
    }

    let mappingGeaendert = false;
    for (const [k, id] of Object.entries(mapping)) {
      if (id === person.id) {
        delete mapping[k];
        mappingGeaendert = true;
      }
    }
    const ergebnisGeaendert = ergebnis?.mitarbeiterId === person.id;

    if (text !== a.rohtext || mappingGeaendert || ergebnisGeaendert) {
      await tx.aenderungsanfrage.update({
        where: { id: a.id },
        data: {
          rohtext: text,
          ...(mappingGeaendert ? { pseudonymMapping: mapping } : {}),
          ...(ergebnisGeaendert ? { parseErgebnis: { ...ergebnis, mitarbeiterId: null } as object } : {}),
        },
      });
      bereinigt++;
    }
  }
  return bereinigt;
}
