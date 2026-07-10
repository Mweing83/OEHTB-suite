// Schlanker API-Client. Nutzt Cookie-basierte Sitzung (credentials: include).
//
// Suite-Integration: Unter dem Reverse-Proxy laeuft das Tool mit Pfad-Praefix
// (z. B. "/handkassen/"), das Vite als BASE_URL setzt. API-Aufrufe werden damit
// praefigiert, damit der Proxy sie diesem Tool zuordnet. Dev: BASE_URL "/".

const BASIS = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

// Fehler mit Zugriff auf die Antwortdaten (z. B. Flags wie passwortSetzenErforderlich)
export class ApiFehler extends Error {
  status: number;
  daten: any;
  constructor(message: string, status: number, daten: any) {
    super(message);
    this.status = status;
    this.daten = daten;
  }
}

async function anfrage<T>(pfad: string, optionen: RequestInit = {}): Promise<T> {
  const res = await fetch(BASIS + pfad, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(optionen.headers || {}) },
    ...optionen,
  });
  if (!res.ok) {
    const daten = await res.json().catch(() => ({}));
    const text = Array.isArray(daten.fehler) ? daten.fehler.join(" ") : daten.fehler || "Fehler";
    throw new ApiFehler(text, res.status, daten);
  }
  return res.json();
}

export const api = {
  get: <T>(pfad: string) => anfrage<T>(pfad),
  post: <T>(pfad: string, body?: unknown) =>
    anfrage<T>(pfad, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(pfad: string, body?: unknown) =>
    anfrage<T>(pfad, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),

  // Beleg-Upload (multipart, daher ohne JSON-Header)
  belegHochladen: async (datei: File): Promise<{ belegId: number }> => {
    const fd = new FormData();
    fd.append("datei", datei);
    const res = await fetch(`${BASIS}/buchungen/belege`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) throw new Error("Beleg-Upload fehlgeschlagen.");
    return res.json();
  },
};
