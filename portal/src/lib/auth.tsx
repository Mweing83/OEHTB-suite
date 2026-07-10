import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { api } from "./api";

// Sitzung des Portals: wer bin ich, welche Tools darf ich sehen.

export interface ToolInfo {
  slug: string;
  name: string;
  beschreibung: string | null;
  pfad: string;
}

export interface Sitzung {
  id: string;
  name: string;
  benutzername: string;
  zugriff: Record<string, string>;
  tools: ToolInfo[];
}

interface AuthKontext {
  benutzer: Sitzung | null;
  laedt: boolean;
  anmelden: (benutzername: string, passwort: string) => Promise<void>;
  abmelden: () => Promise<void>;
  aktualisieren: () => Promise<void>;
}

const Kontext = createContext<AuthKontext>({
  benutzer: null,
  laedt: true,
  anmelden: async () => {},
  abmelden: async () => {},
  aktualisieren: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [benutzer, setBenutzer] = useState<Sitzung | null>(null);
  const [laedt, setLaedt] = useState(true);

  async function aktualisieren() {
    try {
      const me = await api.get<Sitzung>("/api/suite/auth/me");
      setBenutzer(me);
    } catch {
      setBenutzer(null);
    }
  }

  useEffect(() => {
    aktualisieren().finally(() => setLaedt(false));
  }, []);

  async function anmelden(benutzername: string, passwort: string) {
    await api.post("/api/suite/auth/login", { benutzername, passwort });
    await aktualisieren();
  }

  async function abmelden() {
    try {
      await api.post("/api/suite/auth/logout");
    } finally {
      setBenutzer(null);
    }
  }

  return (
    <Kontext.Provider
      value={{ benutzer, laedt, anmelden, abmelden, aktualisieren }}
    >
      {children}
    </Kontext.Provider>
  );
}

export function useAuth(): AuthKontext {
  return useContext(Kontext);
}
