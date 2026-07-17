import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { api } from "./api";

export type Rolle = "admin" | "sachbearbeiter" | "personalverrechnung" | "leser";

export interface Benutzer {
  id: string;
  email: string;
  name: string | null;
  rolle: Rolle;
}

interface AuthContextTyp {
  benutzer: Benutzer | null;
  laedt: boolean;
  abmelden: () => void;
}

const AuthContext = createContext<AuthContextTyp | undefined>(undefined);

// Anmeldung erfolgt seit der Suite-Integration zentral im Portal. Dieses Tool
// prueft nur die bestehende Sitzung ueber einen beliebigen geschuetzten
// Endpunkt; ist keine Sitzung (oder kein Zugriff) vorhanden, leitet es ins
// Portal (Wurzel der Suite) um.
function zumPortal() {
  window.location.href = "/";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [benutzer, setBenutzer] = useState<Benutzer | null>(null);
  const [laedt, setLaedt] = useState(true);

  useEffect(() => {
    // Es gibt kein eigenes /me mehr; ein leichter geschuetzter GET reicht, um
    // Sitzung + Tool-Zugriff zu bestaetigen und die eigene Rolle zu erfahren.
    api
      .get<{ id: string; email: string; name: string | null; rolle: Rolle }>(
        "/api/auth/me"
      )
      .then(setBenutzer)
      .catch(() => setBenutzer(null))
      .finally(() => setLaedt(false));
  }, []);

  function abmelden() {
    // Zentrales Logout liegt im Portal.
    window.location.href = "/api/suite/auth/logout";
  }

  return (
    <AuthContext.Provider value={{ benutzer, laedt, abmelden }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextTyp {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth muss innerhalb von AuthProvider stehen.");
  return ctx;
}

export { zumPortal };
