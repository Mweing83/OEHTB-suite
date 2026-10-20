import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// Pseudonymisierung (GDPR-Kernstueck)
//
// Vor jedem KI-Aufruf werden bekannte Mitarbeiternamen im Rohtext durch
// neutrale Platzhalter ersetzt (PERSON_1, PERSON_2, ...). Das Mapping
// (Platzhalter -> echte Mitarbeiter-ID) bleibt LOKAL und wird mit der
// Anfrage gespeichert, verlaesst das System aber nie Richtung KI.
//
// So sieht das externe Modell nur "PERSON_1 aendert Stunden von 35 auf 30".
// ---------------------------------------------------------------------------

export interface PseudonymMapping {
  // Platzhalter -> Mitarbeiter-ID
  [platzhalter: string]: string;
}

export interface PseudonymisierungErgebnis {
  text: string;
  mapping: PseudonymMapping;
}

// Erzeugt aus Vor- und Nachnamen die Suchvarianten, die in Mails vorkommen.
// Beispiel: "Anna Mayer" -> ["Anna Mayer", "Mayer Anna", "Mayer", "Anna"]
export function namensVarianten(vorname: string, nachname: string): string[] {
  const v = vorname.trim();
  const n = nachname.trim();
  const varianten = [
    `${v} ${n}`,
    `${n} ${v}`,
    n, // Nachname allein (haeufig: "Frau Mayer")
  ];
  // Laengste zuerst, damit "Anna Mayer" vor "Mayer" ersetzt wird.
  return Array.from(new Set(varianten)).sort((a, b) => b.length - a.length);
}

// Escapet einen String fuer die Verwendung in einem regulaeren Ausdruck.
export function regexEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Ersetzt alle bekannten Mitarbeiternamen im Text durch Platzhalter.
export async function pseudonymisieren(
  rohtext: string
): Promise<PseudonymisierungErgebnis> {
  // Auch inaktive Mitarbeiter pseudonymisieren (Mails nennen oft ehemalige
  // Kolleg:innen); nur bereits anonymisierte Datensaetze ausnehmen.
  const mitarbeiter = await prisma.mitarbeiter.findMany({
    where: { NOT: { personalnummer: { startsWith: "GELOESCHT-" } } },
    select: { id: true, vorname: true, nachname: true, email: true },
  });

  let text = rohtext;
  const mapping: PseudonymMapping = {};
  // Damit derselbe Mitarbeiter immer denselben Platzhalter bekommt.
  const idZuPlatzhalter: Record<string, string> = {};
  let zaehler = 0;

  // Mitarbeiter mit laengstem Nachnamen zuerst, reduziert Teil-Treffer.
  const sortiert = [...mitarbeiter].sort(
    (a, b) => b.nachname.length - a.nachname.length
  );

  for (const m of sortiert) {
    // E-Mail-Adresse zuerst (enthaelt oft den Nachnamen), dann Namen.
    const varianten = [...(m.email ? [m.email] : []), ...namensVarianten(m.vorname, m.nachname)];
    for (const variante of varianten) {
      // Wortgrenzen, damit "Mayer" nicht in "Mayerhofer" trifft.
      const re = new RegExp(`\\b${regexEscape(variante)}\\b`, "gi");
      if (re.test(text)) {
        if (!idZuPlatzhalter[m.id]) {
          zaehler += 1;
          const platzhalter = `PERSON_${zaehler}`;
          idZuPlatzhalter[m.id] = platzhalter;
          mapping[platzhalter] = m.id;
        }
        const platzhalter = idZuPlatzhalter[m.id];
        text = text.replace(re, platzhalter);
      }
    }
  }

  return { text, mapping };
}

// Loest einen Platzhalter ueber das Mapping zurueck zur Mitarbeiter-ID auf.
export function reIdentifizieren(
  platzhalter: string,
  mapping: PseudonymMapping
): string | null {
  if (!/^PERSON_\d+$/.test(platzhalter)) return null;
  if (!Object.prototype.hasOwnProperty.call(mapping, platzhalter)) return null;
  const id = mapping[platzhalter];
  return typeof id === "string" ? id : null;
}
