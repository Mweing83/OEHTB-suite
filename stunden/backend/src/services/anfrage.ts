import { prisma } from "../lib/prisma";
import { pseudonymisieren, reIdentifizieren } from "./pseudonym";
import { aktiverProvider } from "./llm/factory";

// ---------------------------------------------------------------------------
// Verarbeitung einer Aenderungsanfrage:
//  1. Pseudonymisieren (lokal)
//  2. KI-Parsing (sieht nur Platzhalter)
//  3. Re-Identifikation (lokal)
//  4. Ergebnis + Status in der Anfrage speichern
// ---------------------------------------------------------------------------

// Bestaetigungs-Modus aus den Admin-Einstellungen.
export type BestaetigungsModus = "immer_manuell" | "automatisch" | "ab_konfidenz";

const EINSTELLUNG_SCHLUESSEL = "workflow_konfig";

interface WorkflowKonfig {
  modus: BestaetigungsModus;
  konfidenzSchwelle: number; // 0..1, nur fuer "ab_konfidenz"
}

const STANDARD_WORKFLOW: WorkflowKonfig = {
  modus: "immer_manuell",
  konfidenzSchwelle: 0.8,
};

export async function ladeWorkflowKonfig(): Promise<WorkflowKonfig> {
  const eintrag = await prisma.einstellung.findUnique({
    where: { schluessel: EINSTELLUNG_SCHLUESSEL },
  });
  if (!eintrag) return STANDARD_WORKFLOW;
  const wert = eintrag.wert as Record<string, unknown>;
  return {
    modus: (wert.modus as BestaetigungsModus) ?? "immer_manuell",
    konfidenzSchwelle:
      typeof wert.konfidenzSchwelle === "number"
        ? wert.konfidenzSchwelle
        : 0.8,
  };
}

// Das aufbereitete Ergebnis, wie es im Feld parseErgebnis gespeichert wird.
// Enthaelt zusaetzlich die aufgeloeste Mitarbeiter-ID (lokal re-identifiziert).
export interface AufbereitetesErgebnis {
  mitarbeiterId: string | null;
  personPlatzhalter: string | null;
  neuStunden: number | null;
  altStunden: number | null;
  ausmassProzent: number | null;
  gueltigAb: string | null;
  konfidenz: number;
  hinweis: string | null;
}

// Verarbeitet eine bereits gespeicherte Anfrage (per ID).
export async function anfrageVerarbeiten(anfrageId: string): Promise<void> {
  const anfrage = await prisma.aenderungsanfrage.findUnique({
    where: { id: anfrageId },
  });
  if (!anfrage) throw new Error("Anfrage nicht gefunden.");

  try {
    // 1. Pseudonymisieren (lokal)
    const { text, mapping } = await pseudonymisieren(anfrage.rohtext);

    // 2. KI-Parsing (sieht nur Platzhalter)
    const provider = await aktiverProvider();
    const ergebnis = await provider.parseAenderung(text);

    // 3. Re-Identifikation (lokal)
    // Nur echte, eigene Mapping-Eintraege aufloesen ("__proto__" o. Ae. vom
    // Modell darf nicht in Object.prototype greifen).
    const mitarbeiterId = ergebnis.personPlatzhalter
      ? reIdentifizieren(ergebnis.personPlatzhalter, mapping)
      : null;

    const aufbereitet: AufbereitetesErgebnis = {
      mitarbeiterId,
      personPlatzhalter: ergebnis.personPlatzhalter,
      neuStunden: ergebnis.neuStunden,
      altStunden: ergebnis.altStunden,
      ausmassProzent: ergebnis.ausmassProzent,
      gueltigAb: ergebnis.gueltigAb,
      konfidenz: ergebnis.konfidenz,
      hinweis: ergebnis.hinweis,
    };

    // 4. Speichern. Mapping bleibt lokal in der Anfrage.
    await prisma.aenderungsanfrage.update({
      where: { id: anfrageId },
      data: {
        status: "GEPARSED",
        parseErgebnis: aufbereitet as unknown as object,
        konfidenz: ergebnis.konfidenz,
        pseudonymMapping: mapping as unknown as object,
      },
    });
  } catch (err) {
    await prisma.aenderungsanfrage.update({
      where: { id: anfrageId },
      data: {
        status: "FEHLER",
        parseErgebnis: {
          fehler: err instanceof Error ? err.message : "Unbekannter Fehler",
        } as object,
      },
    });
    throw err;
  }
}

// Hilfsfunktion: pruefen, ob ein Ergebnis vollstaendig genug fuer eine
// automatische Uebernahme ist (Person + Stunden + Datum vorhanden).
// Automatische Uebernahme nur mit denselben Wertgrenzen wie beim manuellen
// Bestaetigen (Security-Audit 2026-10: vorher landeten z. B. 500 Stunden oder
// 0 % Ausmass ungeprueft in der Historie).
export function istUebernahmefaehig(e: AufbereitetesErgebnis): boolean {
  return (
    e.mitarbeiterId !== null &&
    typeof e.neuStunden === "number" &&
    e.neuStunden > 0 &&
    e.neuStunden <= 168 &&
    typeof e.ausmassProzent === "number" &&
    e.ausmassProzent > 0 &&
    e.ausmassProzent <= 100 &&
    e.gueltigAb !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.gueltigAb) &&
    !Number.isNaN(new Date(e.gueltigAb + "T00:00:00.000Z").getTime())
  );
}
