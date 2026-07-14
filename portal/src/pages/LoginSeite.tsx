import { useState, FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { api, PasswortSetzenErforderlich } from "../lib/api";

export default function LoginSeite() {
  const { anmelden } = useAuth();
  const [benutzername, setBenutzername] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  // Erstlogin-Flow: kein Passwort gesetzt -> Formular zum Festlegen anzeigen.
  const [passwortSetzenFuer, setPasswortSetzenFuer] = useState<string | null>(
    null
  );
  const [neuesPasswort, setNeuesPasswort] = useState("");
  const [neuesPasswortWdh, setNeuesPasswortWdh] = useState("");

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setLaedt(true);
    try {
      await anmelden(benutzername, passwort);
    } catch (err) {
      if (err instanceof PasswortSetzenErforderlich) {
        setPasswortSetzenFuer(err.benutzername);
      } else {
        setFehler(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.");
      }
    } finally {
      setLaedt(false);
    }
  }

  async function passwortFestlegen(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (neuesPasswort !== neuesPasswortWdh) {
      setFehler("Die Passwörter stimmen nicht überein.");
      return;
    }
    setLaedt(true);
    try {
      await api.post("/api/suite/auth/passwort-setzen", {
        benutzername: passwortSetzenFuer,
        neuesPasswort,
      });
      // Direkt anmelden mit dem neuen Passwort.
      await anmelden(passwortSetzenFuer!, neuesPasswort);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setLaedt(false);
    }
  }

  if (passwortSetzenFuer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
          <h1 className="text-xl font-semibold mb-1 text-gray-800">
            Passwort festlegen
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Erste Anmeldung für <strong>{passwortSetzenFuer}</strong> – bitte
            ein neues Passwort vergeben.
          </p>
          <form onSubmit={passwortFestlegen} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Neues Passwort
              </label>
              <input
                type="password"
                value={neuesPasswort}
                onChange={(e) => setNeuesPasswort(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marke-500"
                minLength={8}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Wiederholen
              </label>
              <input
                type="password"
                value={neuesPasswortWdh}
                onChange={(e) => setNeuesPasswortWdh(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marke-500"
                minLength={8}
                required
              />
            </div>
            {fehler && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                {fehler}
              </p>
            )}
            <button
              type="submit"
              disabled={laedt}
              className="w-full bg-marke-600 text-white rounded py-2 font-medium hover:bg-marke-700 disabled:opacity-50"
            >
              {laedt ? "Speichern …" : "Passwort setzen & anmelden"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPasswortSetzenFuer(null);
                setFehler(null);
              }}
              className="w-full text-sm text-gray-500 hover:underline"
            >
              Zurück
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1 text-gray-800">
          ÖHTB Tool-Suite
        </h1>
        <p className="text-sm text-gray-500 mb-6">Bitte anmelden</p>

        <form onSubmit={absenden} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Benutzername
            </label>
            <input
              value={benutzername}
              onChange={(e) => setBenutzername(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marke-500"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Passwort
            </label>
            <input
              type="password"
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marke-500"
              required
            />
          </div>

          {fehler && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
              {fehler}
            </p>
          )}

          <button
            type="submit"
            disabled={laedt}
            className="w-full bg-marke-600 text-white rounded py-2 font-medium hover:bg-marke-700 disabled:opacity-50"
          >
            {laedt ? "Anmelden …" : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}
