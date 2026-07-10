// Gemeinsame Typen fuer das Frontend (passend zu den Backend-Antworten).

export interface BeschaeftigungStand {
  id: string;
  wochenstunden: number;
  ausmassProzent: number;
  gueltigAb: string;
  quelle: string;
  notiz: string | null;
  verarbeitungStatus: "VERARBEITET" | "OFFEN" | null;
}

export interface MitarbeiterListe {
  id: string;
  vorname: string;
  nachname: string;
  personalnummer: string;
  email: string | null;
  bereich: string | null;
  aktiv: boolean;
  austrittAm: string | null; // ISO-Datum oder null
  aktuellerStand: BeschaeftigungStand | null;
  naechsteAenderung: BeschaeftigungStand | null;
}

export interface HistorieEintrag {
  id: string;
  wochenstunden: number;
  ausmassProzent: number;
  gueltigAb: string;
  erfasstAm: string;
  quelle: string;
  notiz: string | null;
}

export interface MitarbeiterDetail extends MitarbeiterListe {
  erstelltAm: string;
  historie: HistorieEintrag[];
}

// --- Anfragen (Mail-Workflow) ---

export interface AnfrageErgebnis {
  mitarbeiterId: string | null;
  personPlatzhalter: string | null;
  neuStunden: number | null;
  altStunden: number | null;
  ausmassProzent: number | null;
  gueltigAb: string | null;
  konfidenz: number;
  hinweis: string | null;
}

export interface Anfrage {
  id: string;
  rohtext: string;
  eingegangenAm: string;
  quelle: string;
  status:
    | "NEU"
    | "GEPARSED"
    | "ZUR_BESTAETIGUNG"
    | "BESTAETIGT"
    | "VERARBEITET"
    | "ABGELEHNT"
    | "FEHLER";
  konfidenz: number | null;
  ergebnis: AnfrageErgebnis | null;
  mitarbeiterName: string | null;
  bearbeitetAm?: string | null;
  verarbeitetAm?: string | null;
}
