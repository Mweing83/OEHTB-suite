// Duenner Wrapper um fetch – sendet Cookies mit und wirft bei Fehlern.
// (Muster Stunden-Tool)

export interface ApiFehler {
  fehler: string;
}

// Sonderfall Login: 409 = Passwort-setzen-erforderlich, kein "Fehler".
export class PasswortSetzenErforderlich extends Error {
  benutzername: string;
  constructor(benutzername: string) {
    super("Passwort setzen erforderlich");
    this.benutzername = benutzername;
  }
}

async function request<T>(pfad: string, optionen: RequestInit = {}): Promise<T> {
  const res = await fetch(pfad, {
    ...optionen,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(optionen.headers ?? {}),
    },
  });

  if (res.status === 409) {
    let daten: Record<string, unknown> = {};
    try {
      daten = await res.json();
    } catch {
      // kein JSON
    }
    if (daten.passwortSetzenErforderlich) {
      throw new PasswortSetzenErforderlich(String(daten.benutzername ?? ""));
    }
    throw new Error(String(daten.fehler ?? "Konflikt."));
  }

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
  delete: <T>(pfad: string) => request<T>(pfad, { method: "DELETE" }),
};
