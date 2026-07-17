// ---------------------------------------------------------------------------
// Gemeinsames Interface fuer alle LLM-Provider des Foerder-Scanners.
//
// Der Scanner braucht PROVIDERSEITIGE Websuche (das Modell durchsucht selbst
// das Web) – deshalb gibt es hier, anders als im Stunden-Tool, keinen
// Ollama-Provider: ein lokales Modell kann nicht ins Internet.
// ---------------------------------------------------------------------------

export interface QuellenInfo {
  name: string;
  webseite: string | null;
  themen: string[];
}

// Eine vom Scan gefundene Ausschreibung (Phase 1: Ueberwachung).
export interface ScanFund {
  quelleName: string; // Name der Foerderquelle, zu der der Fund gehoert
  titel: string;
  link: string | null;
  frist: string | null; // ISO YYYY-MM-DD, null = keine/laufende Frist
  laufendEinreichbar: boolean;
  foerderhoehe: string | null;
  beschreibung: string;
}

// Eine vom Scan entdeckte neue Foerderquelle (Phase 2: Entdeckung).
export interface QuellenFund {
  name: string;
  traeger: string;
  ebene: "BUND" | "LAND" | "GEMEINDE" | "EU" | "PRIVAT";
  kategorie: "PROJEKT" | "KERNGESCHAEFT" | "BEIDES";
  themen: string[];
  beschreibung: string;
  webseite: string | null;
}

export interface LLMProvider {
  name: string;
  sucheAusschreibungen(quellen: QuellenInfo[]): Promise<ScanFund[]>;
  entdeckeQuellen(bekannteNamen: string[]): Promise<QuellenFund[]>;
}

export interface ProviderKonfig {
  provider: "anthropic" | "openai" | "dummy";
  modell?: string;
  apiKey?: string;
}

// Profil der OEHTB fuer die Such-Prompts (Phase 1 + 2).
export const OEHTB_PROFIL =
  "Das OEHTB (Oesterreichisches Hilfswerk fuer Taubblinde und hochgradig " +
  "Hoer- und Sehbehinderte) betreibt Behindertenhilfe in Oesterreich, vor " +
  "allem Wien: Wohnhaeuser/Wohngemeinschaften, Werkstaetten/Tagesstruktur, " +
  "Beratung und Foerderung taubblinder sowie hoer- und sehbehinderter " +
  "Menschen. Relevant sind projektbezogene Foerderungen (z. B. " +
  "Digitalisierung, Bau/Sanierung, Inklusion, Assistenztechnologie) UND " +
  "Foerderungen des Kerngeschaefts (Leistungsfinanzierung Behindertenhilfe).";

// Heutiges Datum fuer Prompts (das Modell soll Fristen relativ dazu bewerten).
export function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Zieht das erste vollstaendige JSON-Array aus einer Modellantwort
// (Modelle umgeben JSON gern mit Text oder ```-Zaeunen).
export function extrahiereJsonArray<T>(text: string): T[] {
  const start = text.indexOf("[");
  const ende = text.lastIndexOf("]");
  if (start === -1 || ende === -1 || ende <= start) {
    throw new Error("Antwort enthaelt kein JSON-Array.");
  }
  return JSON.parse(text.slice(start, ende + 1)) as T[];
}
