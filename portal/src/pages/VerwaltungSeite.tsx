import { useCallback, useEffect, useState, FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import Layout from "../components/Layout";
import { bestaetigen } from "../components/dialog";

interface ToolInfo {
  id: string;
  slug: string;
  name: string;
  beschreibung: string | null;
  pfad: string;
  rollen: string[];
  aktiv: boolean;
}

interface BenutzerRow {
  id: string;
  benutzername: string;
  name: string;
  email: string | null;
  aktiv: boolean;
  passwortSetzen: boolean;
  letzterLogin: string | null;
  zugriff: Record<string, string>;
}

// Zeitstempel -> DD/MM/YYYY, HH:MM (europaeisches Layout).
function datumZeitDe(iso: string): string {
  const d = new Date(iso);
  const tag = String(d.getDate()).padStart(2, "0");
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const stunde = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${tag}/${monat}/${d.getFullYear()}, ${stunde}:${minute}`;
}

export default function VerwaltungSeite() {
  const { benutzer } = useAuth();
  const istVerwalter = benutzer?.zugriff["verwaltung"] === "admin";

  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [benutzerListe, setBenutzerListe] = useState<BenutzerRow[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState<string | null>(null);

  const laden = useCallback(() => {
    setLaedt(true);
    Promise.all([
      api.get<ToolInfo[]>("/api/suite/admin/tools"),
      api.get<BenutzerRow[]>("/api/suite/admin/benutzer"),
    ])
      .then(([t, b]) => {
        setTools(t);
        setBenutzerListe(b);
      })
      .finally(() => setLaedt(false));
  }, []);

  useEffect(laden, [laden]);

  async function zugriffAendern(userId: string, toolSlug: string, rolle: string) {
    setMeldung(null);
    try {
      await api.put(`/api/suite/admin/benutzer/${userId}/zugriff`, {
        zugriff: { [toolSlug]: rolle === "" ? null : rolle },
      });
      laden();
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : "Fehler beim Speichern.");
    }
  }

  async function statusAendern(userId: string, aktiv: boolean) {
    setMeldung(null);
    try {
      await api.put(`/api/suite/admin/benutzer/${userId}`, { aktiv });
      laden();
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : "Fehler.");
    }
  }

  async function passwortZuruecksetzen(userId: string) {
    if (
      !(await bestaetigen(
        "Der Benutzer muss beim nächsten Login ein neues Passwort festlegen.",
        {
          titel: "Passwort zurücksetzen?",
          bestaetigenText: "Zurücksetzen",
        },
      ))
    ) {
      return;
    }
    setMeldung(null);
    try {
      await api.put(`/api/suite/admin/benutzer/${userId}`, { passwortReset: true });
      laden();
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : "Fehler.");
    }
  }

  async function loeschen(userId: string, name: string) {
    if (
      !(await bestaetigen(`Benutzer "${name}" wirklich löschen?`, {
        titel: "Benutzer löschen",
        bestaetigenText: "Löschen",
        gefahr: true,
      }))
    )
      return;
    setMeldung(null);
    try {
      await api.delete(`/api/suite/admin/benutzer/${userId}`);
      laden();
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : "Fehler beim Löschen.");
    }
  }

  if (!istVerwalter) {
    return (
      <Layout>
        <p className="text-gray-600">
          Dieser Bereich ist nur für die Verwaltung zugänglich.
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h2 className="text-xl font-semibold text-gray-800 mb-6">Verwaltung</h2>
      <div className="space-y-6">
        <NeuerBenutzer onAngelegt={laden} />

        {meldung && (
          <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
            {meldung}
          </p>
        )}

        <div className="bg-white rounded-lg shadow-sm p-6 overflow-x-auto">
          <h3 className="font-semibold text-gray-800 mb-4">
            Benutzer &amp; Zugriffsrechte
          </h3>
          {laedt ? (
            <p className="text-gray-500 text-sm">Lädt …</p>
          ) : (
            <table className="text-sm min-w-full">
              <thead className="text-gray-500 text-left">
                <tr>
                  <th className="py-2 pr-4 font-medium">Benutzer</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  {tools.map((t) => (
                    <th key={t.id} className="py-2 pr-4 font-medium">
                      {t.name}
                    </th>
                  ))}
                  <th className="py-2 pr-4 font-medium">Letzter Login</th>
                  <th className="py-2 font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {benutzerListe.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-4">
                      <div className="font-medium text-gray-800">{b.name}</div>
                      <div className="text-xs text-slate-500">
                        {b.benutzername}
                        {b.passwortSetzen && (
                          <span className="ml-2 text-amber-600">
                            (Passwort noch nicht gesetzt)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <label className="inline-flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={b.aktiv}
                          onChange={(e) => statusAendern(b.id, e.target.checked)}
                          disabled={b.id === benutzer?.id}
                        />
                        aktiv
                      </label>
                    </td>
                    {tools.map((t) => (
                      <td key={t.id} className="py-2 pr-4">
                        <select
                          value={b.zugriff[t.slug] ?? ""}
                          onChange={(e) =>
                            zugriffAendern(b.id, t.slug, e.target.value)
                          }
                          className="border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="">kein Zugriff</option>
                          {t.rollen.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                    <td className="py-2 pr-4 text-gray-500 text-xs whitespace-nowrap">
                      {b.letzterLogin ? datumZeitDe(b.letzterLogin) : "–"}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <button
                        onClick={() => passwortZuruecksetzen(b.id)}
                        className="text-xs text-marke-600 hover:underline mr-3"
                      >
                        Passwort zurücksetzen
                      </button>
                      <button
                        onClick={() => loeschen(b.id, b.name)}
                        disabled={b.id === benutzer?.id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-30"
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
                {benutzerListe.length === 0 && (
                  <tr>
                    <td
                      colSpan={4 + tools.length}
                      className="py-4 text-center text-slate-500"
                    >
                      Keine Benutzer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <AuditAnsicht />
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Neuen Benutzer anlegen
// ---------------------------------------------------------------------------
function NeuerBenutzer({ onAngelegt }: { onAngelegt: () => void }) {
  const [zeigt, setZeigt] = useState(false);
  const [benutzername, setBenutzername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setSpeichert(true);
    try {
      await api.post("/api/suite/admin/benutzer", { benutzername, name, email });
      setBenutzername("");
      setName("");
      setEmail("");
      setZeigt(false);
      onAngelegt();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Anlegen.");
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Neuer Benutzer</h3>
        <button
          onClick={() => setZeigt((v) => !v)}
          className="bg-marke-600 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-marke-700"
        >
          {zeigt ? "Abbrechen" : "+ Anlegen"}
        </button>
      </div>

      {zeigt && (
        <form onSubmit={anlegen} className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              Benutzername
            </label>
            <input
              value={benutzername}
              onChange={(e) => setBenutzername(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              E-Mail (optional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          {fehler && (
            <p className="col-span-3 text-sm text-red-600">{fehler}</p>
          )}
          <div className="col-span-3">
            <button
              type="submit"
              disabled={speichert}
              className="bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
            >
              {speichert ? "Speichern …" : "Anlegen"}
            </button>
            <p className="text-xs text-slate-500 mt-2">
              Nach dem Anlegen muss der Benutzer beim ersten Login selbst ein
              Passwort festlegen. Zugriff auf Tools wird unten in der Tabelle
              vergeben.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit-Ansicht
// ---------------------------------------------------------------------------
interface AuditRow {
  id: string;
  zeitpunkt: string;
  aktion: string;
  benutzer: string | null;
  details: unknown;
}

function AuditAnsicht() {
  const [eintraege, setEintraege] = useState<AuditRow[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [geladen, setGeladen] = useState(false);

  function laden() {
    setLaedt(true);
    api
      .get<AuditRow[]>("/api/suite/admin/audit")
      .then(setEintraege)
      .finally(() => {
        setLaedt(false);
        setGeladen(true);
      });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800">Protokoll (Audit-Log)</h3>
          <p className="text-xs text-gray-500">
            Logins, Benutzer- und Rechteänderungen der Suite.
          </p>
        </div>
        <button
          onClick={laden}
          className="bg-marke-600 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-marke-700"
        >
          {geladen ? "Aktualisieren" : "Protokoll laden"}
        </button>
      </div>

      {laedt && <p className="text-gray-500 text-sm">Lädt …</p>}

      {geladen && !laedt && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="py-2 font-medium">Zeitpunkt</th>
                <th className="py-2 font-medium">Aktion</th>
                <th className="py-2 font-medium">Benutzer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {eintraege.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 text-gray-600 whitespace-nowrap">
                    {datumZeitDe(e.zeitpunkt)}
                  </td>
                  <td className="py-2">
                    <span className="text-xs bg-gray-100 rounded px-2 py-0.5">
                      {e.aktion}
                    </span>
                  </td>
                  <td className="py-2 text-gray-600">{e.benutzer ?? "–"}</td>
                </tr>
              ))}
              {eintraege.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-500">
                    Keine Einträge.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
