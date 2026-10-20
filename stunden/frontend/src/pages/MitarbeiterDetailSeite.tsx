import { useEffect, useState, FormEvent, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, mitBasis } from "../lib/api";
import { MitarbeiterDetail } from "../lib/typen";
import { useAuth } from "../lib/auth";
import Layout from "../components/Layout";
import DatumEingabe from "../components/DatumEingabe";
import { bestaetigen, hinweis } from "../components/dialog";

// Datum DD/MM/YYYY (europaeisches Layout) fuer die Anzeige.
function datumDe(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}/${m}/${j}`;
}

export default function MitarbeiterDetailSeite() {
  const { id } = useParams<{ id: string }>();
  const { benutzer } = useAuth();
  const darfBearbeiten =
    benutzer?.rolle === "admin" || benutzer?.rolle === "sachbearbeiter";
  const istAdmin = benutzer?.rolle === "admin";
  // Beschaeftigungen erfassen darf zusaetzlich die Personalverrechnung.
  const darfBeschaeftigungErfassen =
    darfBearbeiten || benutzer?.rolle === "personalverrechnung";

  const [daten, setDaten] = useState<MitarbeiterDetail | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Formular fuer neue Aenderung
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [wochenstunden, setWochenstunden] = useState("");
  const [ausmass, setAusmass] = useState("");
  const [gueltigAb, setGueltigAb] = useState("");
  const [notiz, setNotiz] = useState("");
  const [formFehler, setFormFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  // Formular fuer Stammdaten bearbeiten
  const [zeigeBearbeiten, setZeigeBearbeiten] = useState(false);
  const [bVorname, setBVorname] = useState("");
  const [bNachname, setBNachname] = useState("");
  const [bPersonalnummer, setBPersonalnummer] = useState("");
  const [bEmail, setBEmail] = useState("");
  const [bBereich, setBBereich] = useState("");
  const [bAustritt, setBAustritt] = useState("");
  const [bFehler, setBFehler] = useState<string | null>(null);
  const [bSpeichert, setBSpeichert] = useState(false);

  // Loesch-Auswahl (anonymisieren vs. endgueltig loeschen)
  const [zeigeLoeschen, setZeigeLoeschen] = useState(false);
  const [loescht, setLoescht] = useState(false);

  const laden = useCallback(() => {
    if (!id) return;
    setLaedt(true);
    api
      .get<MitarbeiterDetail>(`/api/mitarbeiter/${id}`)
      .then(setDaten)
      .catch((e) => setFehler(e instanceof Error ? e.message : "Fehler"))
      .finally(() => setLaedt(false));
  }, [id]);

  useEffect(laden, [laden]);

  // DSGVO-Auskunft: Export als JSON-Datei herunterladen.
  async function exportieren() {
    const res = await fetch(mitBasis(`/api/mitarbeiter/${id}/export`), {
      credentials: "include",
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export_${daten?.personalnummer ?? id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Stammdaten-Bearbeitung oeffnen: Felder aus den aktuellen Daten vorbelegen.
  function bearbeitenOeffnen() {
    if (!daten) return;
    setBVorname(daten.vorname);
    setBNachname(daten.nachname);
    setBPersonalnummer(daten.personalnummer);
    setBEmail(daten.email ?? "");
    setBBereich(daten.bereich ?? "");
    setBAustritt(daten.austrittAm ?? "");
    setBFehler(null);
    setZeigeBearbeiten(true);
  }

  async function stammdatenSpeichern(e: FormEvent) {
    e.preventDefault();
    setBFehler(null);
    if (!bVorname.trim() || !bNachname.trim() || !bPersonalnummer.trim()) {
      setBFehler("Vorname, Nachname und Personalnummer sind erforderlich.");
      return;
    }
    setBSpeichert(true);
    try {
      await api.put(`/api/mitarbeiter/${id}`, {
        vorname: bVorname.trim(),
        nachname: bNachname.trim(),
        personalnummer: bPersonalnummer.trim(),
        email: bEmail.trim(),
        bereich: bBereich.trim(),
        austrittAm: bAustritt,
      });
      setZeigeBearbeiten(false);
      laden();
    } catch (err) {
      setBFehler(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setBSpeichert(false);
    }
  }

  // Loeschung (nur Admin). hart=true entfernt die Person inkl. Verlauf
  // vollstaendig; sonst wird anonymisiert (DSGVO-Standard, Verlauf bleibt).
  async function loeschen(hart: boolean) {
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
      window.location.href = "/";
    } catch (err) {
      await hinweis(err instanceof Error ? err.message : "Fehler beim Löschen.");
      setLoescht(false);
    }
  }

  async function aenderungSpeichern(e: FormEvent) {
    e.preventDefault();
    setFormFehler(null);

    // Explizite Validierung VOR dem Senden – verhindert NaN, das durch
    // undefined-Pruefungen rutscht (Lehre aus dem Handkassen-Projekt).
    const std = Number(wochenstunden.replace(",", "."));
    const aus = Number(ausmass.replace(",", "."));
    if (!Number.isFinite(std) || std <= 0) {
      setFormFehler("Bitte gültige Wochenstunden eingeben.");
      return;
    }
    if (!Number.isFinite(aus) || aus <= 0 || aus > 100) {
      setFormFehler("Bitte gültiges Ausmaß (1–100 %) eingeben.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gueltigAb)) {
      setFormFehler("Bitte ein gültiges Datum wählen.");
      return;
    }

    setSpeichert(true);
    try {
      await api.post(`/api/mitarbeiter/${id}/beschaeftigung`, {
        wochenstunden: std,
        ausmassProzent: aus,
        gueltigAb,
        notiz: notiz || undefined,
      });
      setWochenstunden("");
      setAusmass("");
      setGueltigAb("");
      setNotiz("");
      setZeigeFormular(false);
      laden();
    } catch (err) {
      setFormFehler(
        err instanceof Error ? err.message : "Fehler beim Speichern."
      );
    } finally {
      setSpeichert(false);
    }
  }

  if (laedt) {
    return (
      <Layout>
        <p className="text-gray-500">Lädt …</p>
      </Layout>
    );
  }
  if (fehler || !daten) {
    return (
      <Layout>
        <p className="text-red-600">{fehler ?? "Nicht gefunden."}</p>
        <Link to="/" className="text-marke-600 hover:underline text-sm">
          ← Zurück zum Dashboard
        </Link>
      </Layout>
    );
  }

  const heute = new Date().toISOString().slice(0, 10);

  return (
    <Layout>
      <Link to="/" className="text-marke-600 hover:underline text-sm">
        ← Zurück zum Dashboard
      </Link>

      <div className="bg-white rounded-lg shadow-sm p-6 mt-3 mb-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold text-gray-800">
            {daten.nachname}, {daten.vorname}
          </h2>
          <div className="flex gap-2">
            {darfBearbeiten && (
              <button
                onClick={() =>
                  zeigeBearbeiten ? setZeigeBearbeiten(false) : bearbeitenOeffnen()
                }
                className={
                  "border border-gray-300 rounded px-2.5 py-1.5 text-gray-700 hover:bg-gray-50 " +
                  (zeigeBearbeiten ? "bg-gray-100" : "")
                }
                title="Stammdaten bearbeiten"
                aria-label="Stammdaten bearbeiten"
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
            )}
            {benutzer?.rolle !== "leser" && (
              <button
                onClick={exportieren}
                className="text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-700 hover:bg-gray-50"
                title="DSGVO-Auskunft als JSON herunterladen"
              >
                Daten exportieren
              </button>
            )}
            {istAdmin && (
              <button
                onClick={() => setZeigeLoeschen((v) => !v)}
                className={
                  "border border-red-200 text-red-700 rounded px-2.5 py-1.5 hover:bg-red-50 " +
                  (zeigeLoeschen ? "bg-red-50" : "")
                }
                title="Person löschen"
                aria-label="Person löschen"
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
        </div>
        {zeigeBearbeiten && (
          <form
            onSubmit={stammdatenSpeichern}
            className="mt-4 bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-sm text-gray-700 mb-1">Vorname</label>
              <input
                value={bVorname}
                onChange={(e) => setBVorname(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Nachname</label>
              <input
                value={bNachname}
                onChange={(e) => setBNachname(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Personalnummer
              </label>
              <input
                value={bPersonalnummer}
                onChange={(e) => setBPersonalnummer(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Bereich (z. B. VBW)
              </label>
              <input
                value={bBereich}
                onChange={(e) => setBBereich(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-gray-700 mb-1">
                E-Mail (optional)
              </label>
              <input
                type="email"
                value={bEmail}
                onChange={(e) => setBEmail(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-gray-700 mb-1">
                Austrittsdatum (optional)
              </label>
              <DatumEingabe
                value={bAustritt}
                onChange={setBAustritt}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                Leer = beschäftigt. Ab diesem Tag zählt die Person nicht mehr zum
                aktuellen Stand und wird in Stichtags-Exporten danach
                ausgeblendet.
              </p>
            </div>
            {bFehler && (
              <p className="col-span-2 text-sm text-red-600">{bFehler}</p>
            )}
            <div className="col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={bSpeichert}
                className="bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
              >
                {bSpeichert ? "Speichern …" : "Stammdaten speichern"}
              </button>
              <button
                type="button"
                onClick={() => setZeigeBearbeiten(false)}
                className="border border-gray-300 rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Abbrechen
              </button>
            </div>
          </form>
        )}

        {zeigeLoeschen && istAdmin && (
          <div className="mt-4 border border-red-200 bg-red-50 rounded-lg p-4">
            <p className="text-sm font-medium text-red-800 mb-1">
              Person löschen
            </p>
            <p className="text-xs text-red-700 mb-3">
              <strong>Anonymisieren</strong> (empfohlen): Stammdaten werden
              unkenntlich gemacht und die Person deaktiviert; der
              entpersonalisierte Beschäftigungsverlauf bleibt für gesetzliche
              Aufbewahrungsfristen erhalten.
              <br />
              <strong>Endgültig löschen</strong>: entfernt die Person samt
              gesamtem Verlauf unwiderruflich – nur, wenn keine
              Aufbewahrungspflicht (mehr) besteht (z. B. Fehleintrag).
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => loeschen(false)}
                disabled={loescht}
                className="text-sm bg-amber-600 text-white rounded px-3 py-1.5 hover:bg-amber-700 disabled:opacity-50"
              >
                Anonymisieren
              </button>
              <button
                onClick={() => loeschen(true)}
                disabled={loescht}
                className="text-sm bg-red-600 text-white rounded px-3 py-1.5 hover:bg-red-700 disabled:opacity-50"
              >
                Endgültig löschen
              </button>
              <button
                onClick={() => setZeigeLoeschen(false)}
                disabled={loescht}
                className="text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-700 hover:bg-gray-100"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
          <div>
            <span className="text-gray-500 block">Personalnummer</span>
            {daten.personalnummer}
          </div>
          <div>
            <span className="text-gray-500 block">Bereich</span>
            {daten.bereich ?? "–"}
          </div>
          <div>
            <span className="text-gray-500 block">E-Mail</span>
            {daten.email ?? "–"}
          </div>
          {daten.austrittAm && (
            <div>
              <span className="text-gray-500 block">Ausgetreten am</span>
              <span className="text-red-700">{datumDe(daten.austrittAm)}</span>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-6">
          <div className="bg-marke-50 rounded-lg px-5 py-4">
            <span className="text-xs text-marke-700 block">
              Aktuelle Wochenstunden
            </span>
            <span className="text-2xl font-semibold text-marke-900">
              {daten.aktuellerStand
                ? daten.aktuellerStand.wochenstunden.toLocaleString("de-DE")
                : "–"}
            </span>
          </div>
          <div className="bg-marke-50 rounded-lg px-5 py-4">
            <span className="text-xs text-marke-700 block">Aktuelles Ausmaß</span>
            <span className="text-2xl font-semibold text-marke-900">
              {daten.aktuellerStand
                ? `${daten.aktuellerStand.ausmassProzent.toLocaleString(
                    "de-DE"
                  )} %`
                : "–"}
            </span>
          </div>
          {daten.naechsteAenderung && (
            <div className="bg-amber-50 rounded-lg px-5 py-4">
              <span className="text-xs text-amber-700 block">
                Anstehende Änderung ab{" "}
                {datumDe(daten.naechsteAenderung.gueltigAb)}
              </span>
              <span className="text-2xl font-semibold text-amber-900">
                {daten.naechsteAenderung.wochenstunden.toLocaleString("de-DE")}{" "}
                Std /{" "}
                {daten.naechsteAenderung.ausmassProzent.toLocaleString("de-DE")}{" "}
                %
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Historie */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">
            Verlauf der Beschäftigung
          </h3>
          {darfBeschaeftigungErfassen && (
            <button
              onClick={() => setZeigeFormular((v) => !v)}
              className="bg-marke-600 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-marke-700"
            >
              {zeigeFormular ? "Abbrechen" : "+ Änderung erfassen"}
            </button>
          )}
        </div>

        {zeigeFormular && (
          <form
            onSubmit={aenderungSpeichern}
            className="bg-gray-50 rounded-lg p-4 mb-6 grid grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Wochenstunden
              </label>
              <input
                value={wochenstunden}
                onChange={(e) => setWochenstunden(e.target.value)}
                placeholder="z. B. 30"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Ausmaß (%)
              </label>
              <input
                value={ausmass}
                onChange={(e) => setAusmass(e.target.value)}
                placeholder="z. B. 75"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Gültig ab
              </label>
              <DatumEingabe
                value={gueltigAb}
                onChange={setGueltigAb}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Notiz (optional)
              </label>
              <input
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            {formFehler && (
              <p className="col-span-2 text-sm text-red-600">{formFehler}</p>
            )}
            <div className="col-span-2">
              <button
                type="submit"
                disabled={speichert}
                className="bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
              >
                {speichert ? "Speichern …" : "Änderung speichern"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {daten.historie.map((h) => {
            const zukunft = h.gueltigAb > heute;
            return (
              <div
                key={h.id}
                className={
                  "flex items-center gap-4 rounded-lg px-4 py-3 border " +
                  (zukunft
                    ? "border-amber-200 bg-amber-50"
                    : "border-gray-100 bg-white")
                }
              >
                <div className="w-28 text-sm font-medium text-gray-700">
                  {datumDe(h.gueltigAb)}
                  {zukunft && (
                    <span className="block text-xs text-amber-700">
                      (geplant)
                    </span>
                  )}
                </div>
                <div className="flex-1 text-sm">
                  <span className="font-medium">
                    {h.wochenstunden.toLocaleString("de-DE")} Std
                  </span>
                  {" · "}
                  {h.ausmassProzent.toLocaleString("de-DE")} %
                  {h.notiz && (
                    <span className="text-gray-500"> — {h.notiz}</span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{h.quelle}</div>
              </div>
            );
          })}
          {daten.historie.length === 0 && (
            <p className="text-slate-500 text-sm">
              Noch keine Beschäftigungsdaten erfasst.
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}
