import { useEffect, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { MitarbeiterListe } from "../lib/typen";
import { useAuth } from "../lib/auth";
import Layout from "../components/Layout";
import DatumEingabe from "../components/DatumEingabe";
import { bestaetigen, hinweis } from "../components/dialog";

// Datum DD/MM/YYYY (europaeisches Layout) fuer die Anzeige.
function datumDe(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}/${m}/${j}`;
}

export default function MitarbeiterSeite() {
  const { benutzer } = useAuth();
  const darfBearbeiten =
    benutzer?.rolle === "admin" || benutzer?.rolle === "sachbearbeiter";
  const istAdmin = benutzer?.rolle === "admin";
  const heute = new Date().toISOString().slice(0, 10);

  const [liste, setListe] = useState<MitarbeiterListe[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  // null = Anlegen-Modus, sonst die ID des bearbeiteten Mitarbeiters.
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  // Welche Zeile gerade im Loesch-Bestaetigungsmodus ist.
  const [loeschId, setLoeschId] = useState<string | null>(null);
  const [loescht, setLoescht] = useState(false);

  // Formularfelder
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [personalnummer, setPersonalnummer] = useState("");
  const [email, setEmail] = useState("");
  const [bereich, setBereich] = useState("");
  const [austrittAm, setAustrittAm] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  function laden() {
    api
      .get<MitarbeiterListe[]>("/api/mitarbeiter?alle=1")
      .then(setListe)
      .finally(() => setLaedt(false));
  }

  useEffect(laden, []);

  function felderLeeren() {
    setVorname("");
    setNachname("");
    setPersonalnummer("");
    setEmail("");
    setBereich("");
    setAustrittAm("");
    setFehler(null);
  }

  function neuOeffnen() {
    setBearbeiteId(null);
    felderLeeren();
    setZeigeFormular(true);
  }

  function bearbeitenOeffnen(m: MitarbeiterListe) {
    setBearbeiteId(m.id);
    setVorname(m.vorname);
    setNachname(m.nachname);
    setPersonalnummer(m.personalnummer);
    setEmail(m.email ?? "");
    setBereich(m.bereich ?? "");
    setAustrittAm(m.austrittAm ?? "");
    setFehler(null);
    setZeigeFormular(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abbrechen() {
    setZeigeFormular(false);
    setBearbeiteId(null);
    felderLeeren();
  }

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setSpeichert(true);
    try {
      const daten = { vorname, nachname, personalnummer, email, bereich };
      if (bearbeiteId) {
        // Austrittsdatum nur beim Bearbeiten (neue Mitarbeiter sind aktiv).
        await api.put(`/api/mitarbeiter/${bearbeiteId}`, { ...daten, austrittAm });
      } else {
        await api.post("/api/mitarbeiter", daten);
      }
      abbrechen();
      laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSpeichert(false);
    }
  }

  // hart=true entfernt die Person inkl. Verlauf vollstaendig; sonst wird
  // anonymisiert (DSGVO-Standard, entpersonalisierter Verlauf bleibt erhalten).
  async function loeschen(id: string, hart: boolean) {
    if (
      hart &&
      !(await bestaetigen(
        "Person und gesamten Beschäftigungsverlauf endgültig löschen? " +
          "Diese Aktion kann nicht rückgängig gemacht werden.",
        { titel: "Endgültig löschen", bestaetigenText: "Löschen", gefahr: true },
      ))
    ) {
      return;
    }
    setLoescht(true);
    try {
      await api.delete(`/api/mitarbeiter/${id}${hart ? "?hart=1" : ""}`);
      setLoeschId(null);
      laden();
    } catch (err) {
      await hinweis(err instanceof Error ? err.message : "Fehler beim Löschen.");
    } finally {
      setLoescht(false);
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Mitarbeiter</h2>
        {darfBearbeiten && (
          <button
            onClick={() => (zeigeFormular ? abbrechen() : neuOeffnen())}
            className="bg-marke-600 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-marke-700"
          >
            {zeigeFormular ? "Abbrechen" : "+ Neuer Mitarbeiter"}
          </button>
        )}
      </div>

      {zeigeFormular && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-800 mb-4">
            {bearbeiteId ? "Mitarbeiter bearbeiten" : "Neuen Mitarbeiter anlegen"}
          </h3>
          <form onSubmit={speichern} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Vorname</label>
              <input
                value={vorname}
                onChange={(e) => setVorname(e.target.value)}
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Nachname
              </label>
              <input
                value={nachname}
                onChange={(e) => setNachname(e.target.value)}
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Personalnummer
              </label>
              <input
                value={personalnummer}
                onChange={(e) => setPersonalnummer(e.target.value)}
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Bereich (z. B. VBW)
              </label>
              <input
                value={bereich}
                onChange={(e) => setBereich(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
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

            {bearbeiteId && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Austrittsdatum (optional)
                </label>
                <DatumEingabe
                  value={austrittAm}
                  onChange={setAustrittAm}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Leer = beschäftigt. Ab diesem Tag zählt die Person nicht mehr
                  zum aktuellen Stand und wird in Stichtags-Exporten danach
                  ausgeblendet.
                </p>
              </div>
            )}

            {fehler && (
              <p className="col-span-2 text-sm text-red-600">{fehler}</p>
            )}

            <div className="col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={speichert}
                className="bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
              >
                {speichert
                  ? "Speichern …"
                  : bearbeiteId
                  ? "Änderungen speichern"
                  : "Anlegen"}
              </button>
              <button
                type="button"
                onClick={abbrechen}
                className="border border-gray-300 rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {laedt ? (
        <p className="text-gray-500">Lädt …</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Personalnr.</th>
                <th className="px-4 py-3 font-medium">Bereich</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Austritt</th>
                {darfBearbeiten && (
                  <th className="px-4 py-3 font-medium text-right">Aktionen</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liste.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/mitarbeiter/${m.id}`}
                      className="text-marke-600 hover:underline font-medium"
                    >
                      {m.nachname}, {m.vorname}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.personalnummer}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.bereich ?? "–"}
                  </td>
                  <td className="px-4 py-3">
                    {m.austrittAm && m.austrittAm <= heute ? (
                      <span className="text-red-600 text-xs">ausgetreten</span>
                    ) : !m.aktiv ? (
                      <span className="text-slate-500 text-xs">inaktiv</span>
                    ) : (
                      <span className="text-green-700 text-xs">aktiv</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {m.austrittAm ? datumDe(m.austrittAm) : ""}
                  </td>
                  {darfBearbeiten && (
                    <td className="px-4 py-3">
                      {loeschId === m.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-gray-500">Löschen:</span>
                          <button
                            onClick={() => loeschen(m.id, false)}
                            disabled={loescht}
                            className="text-xs bg-amber-600 text-white rounded px-2 py-1 hover:bg-amber-700 disabled:opacity-50"
                            title="Stammdaten anonymisieren, Verlauf bleibt erhalten (DSGVO)"
                          >
                            Anonymisieren
                          </button>
                          <button
                            onClick={() => loeschen(m.id, true)}
                            disabled={loescht}
                            className="text-xs bg-red-600 text-white rounded px-2 py-1 hover:bg-red-700 disabled:opacity-50"
                            title="Person samt Verlauf endgültig löschen"
                          >
                            Endgültig
                          </button>
                          <button
                            onClick={() => setLoeschId(null)}
                            disabled={loescht}
                            className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-600 hover:bg-gray-100"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => bearbeitenOeffnen(m)}
                            className="text-marke-600 hover:text-marke-800"
                            title="Bearbeiten"
                            aria-label="Bearbeiten"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          {istAdmin && (
                            <button
                              onClick={() => setLoeschId(m.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Löschen"
                              aria-label="Löschen"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {liste.length === 0 && (
                <tr>
                  <td
                    colSpan={darfBearbeiten ? 6 : 5}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    Noch keine Mitarbeiter angelegt.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
