// Gemeinsame Typen + deutsche Beschriftungen fuer Enums (Spiegel des Backends).

export type Ebene = "BUND" | "LAND" | "GEMEINDE" | "EU" | "PRIVAT";
export type Kategorie = "PROJEKT" | "KERNGESCHAEFT" | "BEIDES";
export type QuelleStatus = "AKTIV" | "VORGESCHLAGEN" | "ARCHIVIERT";
export type AusschreibungStatus = "OFFEN" | "VORGESCHLAGEN" | "ABGELAUFEN" | "ABGELEHNT";

export interface Foerderquelle {
  id: string;
  name: string;
  traeger: string;
  ebene: Ebene;
  kategorie: Kategorie;
  themen: string[];
  beschreibung: string;
  webseite: string | null;
  kontakt: string | null;
  status: QuelleStatus;
  quelleTyp: "MANUELL" | "SCAN";
  ausschreibungen?: Ausschreibung[];
  _count?: { ausschreibungen: number };
}

export interface Ausschreibung {
  id: string;
  foerderquelleId: string;
  foerderquelle?: Foerderquelle;
  titel: string;
  beschreibung: string;
  link: string | null;
  frist: string | null; // ISO-Zeitstempel vom Backend
  laufendEinreichbar: boolean;
  foerderhoehe: string | null;
  status: AusschreibungStatus;
  quelleTyp: "MANUELL" | "SCAN";
  aktualisiertAusschreibungId: string | null;
  aktualisiertAusschreibung?: Ausschreibung | null;
}

export interface ScanLauf {
  id: string;
  gestartet: string;
  beendet: string | null;
  ausloeser: "ZEITPLAN" | "MANUELL";
  statistik: Record<string, Record<string, number>> | null;
  fehler: string | null;
}

export const EBENE_LABEL: Record<Ebene, string> = {
  BUND: "Bund",
  LAND: "Land",
  GEMEINDE: "Gemeinde",
  EU: "EU",
  PRIVAT: "Privat",
};

export const KATEGORIE_LABEL: Record<Kategorie, string> = {
  PROJEKT: "Projekt",
  KERNGESCHAEFT: "Kerngeschäft",
  BEIDES: "Projekt + Kerngeschäft",
};

// Frist formatieren (deutsches Datum) und Dringlichkeit ableiten.
export function fristText(a: Ausschreibung): string {
  if (a.laufendEinreichbar) return "laufend einreichbar";
  if (!a.frist) return "ohne Frist";
  return new Date(a.frist).toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function fristTage(a: Ausschreibung): number | null {
  if (!a.frist || a.laufendEinreichbar) return null;
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  return Math.round((new Date(a.frist).getTime() - heute.getTime()) / (24 * 60 * 60 * 1000));
}

// Tailwind-Klassen fuer die Dringlichkeit (Suite-Statusfarben).
export function fristKlasse(a: Ausschreibung): string {
  const tage = fristTage(a);
  if (tage === null) return "text-gray-600";
  if (tage < 7) return "text-gefahr-700 font-semibold";
  if (tage < 30) return "text-warnung-700 font-semibold";
  return "text-gray-700";
}
