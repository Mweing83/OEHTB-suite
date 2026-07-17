// Duenner Wrapper um fetch – sendet Cookies mit und wirft bei Fehlern.
//
// Suite-Integration: Wird das Tool unter einem Pfad-Praefix ausgeliefert
// (z. B. "/stunden/"), traegt Vite dies als import.meta.env.BASE_URL. Alle
// API-Aufrufe werden damit praefigiert, sodass der Reverse-Proxy sie diesem
// Tool zuordnet. In der Entwicklung ist BASE_URL "/" – unveraendertes Verhalten.

export interface ApiFehler {
  fehler: string;
}

// BASE_URL endet mit "/"; fuehrenden Slash der Pfade nicht doppeln.
const BASIS = import.meta.env.BASE_URL.replace(/\/$/, "");

export function mitBasis(pfad: string): string {
  return BASIS + pfad;
}

async function request<T>(
  pfad: string,
  optionen: RequestInit = {}
): Promise<T> {
  const res = await fetch(mitBasis(pfad), {
    ...optionen,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(optionen.headers ?? {}),
    },
  });

  if (!res.ok) {
    let nachricht = "Unbekannter Fehler";
    try {
      const daten = (await res.json()) as ApiFehler;
      nachricht = daten.fehler ?? nachricht;
    } catch {
      // Antwort ohne JSON-Body
    }
    throw new Error(nachricht);
  }

  // 204 / leere Antwort abfangen
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const api = {
  get: <T>(pfad: string) => request<T>(pfad),
  post: <T>(pfad: string, body?: unknown) =>
    request<T>(pfad, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(pfad: string, body?: unknown) =>
    request<T>(pfad, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(pfad: string, body?: unknown) =>
    request<T>(pfad, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(pfad: string) => request<T>(pfad, { method: "DELETE" }),
};
