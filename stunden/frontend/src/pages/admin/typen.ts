// Antwort von GET /api/admin/einstellungen (von mehreren Abschnitten gelesen).
export interface Einstellungen {
  llm: {
    provider: string;
    modell: string;
    endpoint: string;
    apiKeyGesetzt: boolean;
  };
  workflow: {
    modus: string;
    konfidenzSchwelle: number;
  };
  vollzeit: {
    stunden: number;
  };
}
