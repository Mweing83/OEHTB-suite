import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api.js";

export interface Benutzer {
  id: number;
  name: string;
  rolle: "erfasser" | "leitung" | "finanzen" | "admin";
}

interface AuthKontext {
  benutzer: Benutzer | null;
  laden: boolean;
  abmelden: () => Promise<void>;
  inaktivWarnung: boolean;
  aktivitaetMelden: () => void;
}

const Kontext = createContext<AuthKontext>(null as unknown as AuthKontext);

// Zeiten für den automatischen Logout bei Inaktivität
const TIMEOUT_MS = 15 * 60 * 1000; // 15 Minuten bis Abmeldung
const WARNUNG_MS = 14 * 60 * 1000; // Warnung 1 Minute vorher

// Anmeldung erfolgt seit der Suite-Integration zentral im Portal (Wurzel "/").
// Bei fehlender Sitzung / Abmeldung wird dorthin geleitet.
function zumPortal() {
  window.location.href = "/";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [benutzer, setBenutzer] = useState<Benutzer | null>(null);
  const [laden, setLaden] = useState(true);
  const [inaktivWarnung, setInaktivWarnung] = useState(false);

  useEffect(() => {
    api
      .get<Benutzer>("/auth/me")
      .then(setBenutzer)
      .catch(() => setBenutzer(null))
      .finally(() => setLaden(false));
  }, []);

  async function abmelden() {
    await api.post("/auth/logout").catch(() => {});
    setBenutzer(null);
    setInaktivWarnung(false);
    zumPortal();
  }

  const aktivitaetMelden = () => {
    setInaktivWarnung(false);
    window.dispatchEvent(new Event("mousedown"));
  };

  useEffect(() => {
    if (!benutzer) return;

    let warnTimer: ReturnType<typeof setTimeout>;
    let logoutTimer: ReturnType<typeof setTimeout>;

    const zuruecksetzen = () => {
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      setInaktivWarnung(false);
      warnTimer = setTimeout(() => setInaktivWarnung(true), WARNUNG_MS);
      logoutTimer = setTimeout(() => {
        abmelden();
      }, TIMEOUT_MS);
    };

    const ereignisse = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    const handler = () => zuruecksetzen();
    ereignisse.forEach((e) => window.addEventListener(e, handler, { passive: true }));

    zuruecksetzen();

    return () => {
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      ereignisse.forEach((e) => window.removeEventListener(e, handler));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benutzer]);

  return (
    <Kontext.Provider value={{ benutzer, laden, abmelden, inaktivWarnung, aktivitaetMelden }}>
      {children}
    </Kontext.Provider>
  );
}

export function useAuth() {
  return useContext(Kontext);
}
