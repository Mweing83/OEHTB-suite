import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { Anfrage, MitarbeiterListe } from "../lib/typen";
import { useAuth } from "../lib/auth";
import Layout from "../components/Layout";
import DatumEingabe from "../components/DatumEingabe";

// Datum DD/MM/YYYY (europaeisches Layout) fuer die Anzeige.
function datumDe(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [j, m, t] = iso.split("-");
  return `${t}/${m}/${j}`;
}

// Zeitstempel (ISO mit Uhrzeit) -> Datum DD/MM/YYYY fuer die Anzeige.
function datumZeitstempelDe(iso: string): string {
  const d = new Date(iso);
  const tag = String(d.getDate()).padStart(2, "0");
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  return `${tag}/${monat}/${d.getFullYear()}`;
}

type Bereich = "eingang" | "verarbeitung";

export default function AnfragenSeite() {
  const { benutzer } = useAuth();
  const istHr =
    benutzer?.rolle === "ADMIN" || benutzer?.rolle === "SACHBEARBEITER";
  const istVerrechnung =
    benutzer?.rolle === "ADMIN" || benutzer?.rolle === "PERSONALVERRECHNUNG";
  // SACHBEARBEITER und PERSONALVERRECHNUNG duerfen im Eingang bestaetigen.
  const darfBestaetigen =
    benutzer?.rolle === "ADMIN" ||
    benutzer?.rolle === "SACHBEARBEITER" ||
    benutzer?.rolle === "PERSONALVERRECHNUNG";

  // Standard-Bereich je nach Rolle: Verrechnung startet bei "verarbeitung".
  const [bereich, setBereich] = useState<Bereich>(
    benutzer?.rolle === "PERSONALVERRECHNUNG" ? "verarbeitung" : "eingang"
  );

  const [eingang, setEingang] = useState<Anfrage[]>([]);
  const [verarbeitung, setVerarbeitung] = useState<Anfrage[]>([]);
  const [mitarbeiter, setMitarbeiter] = useState<MitarbeiterListe[]>([]);
  const [laedt, setLaedt] = useState(true);

  const [rohtext, setRohtext] = useState("");
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(() => {
    Promise.all([
      api.get<Anfrage[]>("/api/anfragen"),
      api.get<Anfrage[]>("/api/anfragen?verarbeitung=offen"),
      api.get<MitarbeiterListe[]>("/api/mitarbeiter?alle=1"),
    ])
      .then(([e, v, m]) => {
        setEingang(e);
        setVerarbeitung(v);
        setMitarbeiter(m);
      })
      .finally(() => setLaedt(false));
  }, []);

  useEffect(laden, [laden]);

  async function einreichen() {
    if (rohtext.trim().length < 3) return;
    setSendet(true);
    setFehler(null);
    try {
      await api.post("/api/anfragen", { rohtext });
      setRohtext("");
      laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Senden.");
    } finally {
      setSendet(false);
    }
  }

  return (
    <Layout>
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        Änderungsanfragen
      </h2>

      {/* Umschalter zwischen Eingang und Verarbeitung */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setBereich("eingang")}
          className={
            "px-4 py-1.5 rounded text-sm font-medium " +
            (bereich === "eingang"
              ? "bg-white shadow-sm text-gray-800"
              : "text-gray-500")
          }
        >
          Eingang{eingang.length > 0 && ` (${eingang.length})`}
        </button>
        <button
          onClick={() => setBereich("verarbeitung")}
          className={
            "px-4 py-1.5 rounded text-sm font-medium " +
            (bereich === "verarbeitung"
              ? "bg-white shadow-sm text-gray-800"
              : "text-gray-500")
          }
        >
          Zur Verarbeitung{verarbeitung.length > 0 && ` (${verarbeitung.length})`}
        </button>
      </div>

      {/* --- Bereich: Eingang --- */}
      {bereich === "eingang" && (
        <>
          {istHr && (
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h3 className="font-semibold text-gray-800 mb-2">
                Neue Mitteilung einfügen
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                Text aus einer E-Mail hier einfügen. Namen werden vor der
                KI-Auswertung lokal durch Platzhalter ersetzt.
              </p>
              <textarea
                value={rohtext}
                onChange={(e) => setRohtext(e.target.value)}
                rows={4}
                placeholder="z. B.: Frau Mayer ändert ihre Wochenstunden von 35 auf 30 ab 01.10.2026."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
              {fehler && <p className="text-sm text-red-600 mt-2">{fehler}</p>}
              <div className="mt-3">
                <button
                  onClick={einreichen}
                  disabled={sendet || rohtext.trim().length < 3}
                  className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {sendet ? "Wird ausgewertet …" : "Auswerten"}
                </button>
              </div>
            </div>
          )}

          <h3 className="font-semibold text-gray-800 mb-3">Offene Anfragen</h3>
          {laedt ? (
            <p className="text-gray-500">Lädt …</p>
          ) : eingang.length === 0 ? (
            <p className="text-gray-400 text-sm">Keine offenen Anfragen.</p>
          ) : (
            <div className="space-y-4">
              {eingang.map((a) => (
                <AnfrageKarte
                  key={a.id}
                  anfrage={a}
                  mitarbeiter={mitarbeiter}
                  darfBearbeiten={darfBestaetigen}
                  onAktualisiert={laden}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* --- Bereich: Verarbeitung --- */}
      {bereich === "verarbeitung" && (
        <>
          <div className="bg-blue-50 rounded-lg px-4 py-3 mb-4 text-sm text-blue-800">
            Bestätigte Änderungen, die noch in die externen Systeme
            (Buchhaltung, Lohnverrechnung) eingepflegt werden müssen.
          </div>
          {laedt ? (
            <p className="text-gray-500">Lädt …</p>
          ) : verarbeitung.length === 0 ? (
            <p className="text-gray-400 text-sm">
              Keine Änderungen zur Verarbeitung offen.
            </p>
          ) : (
            <div className="space-y-4">
              {verarbeitung.map((a) => (
                <VerarbeitungKarte
                  key={a.id}
                  anfrage={a}
                  darfVerarbeiten={istVerrechnung}
                  onAktualisiert={laden}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Eingangs-Karte: Vorschlag, korrigierbare Felder, Bestätigen/Ablehnen.
// ---------------------------------------------------------------------------
function AnfrageKarte({
  anfrage,
  mitarbeiter,
  darfBearbeiten,
  onAktualisiert,
}: {
  anfrage: Anfrage;
  mitarbeiter: MitarbeiterListe[];
  darfBearbeiten: boolean;
  onAktualisiert: () => void;
}) {
  const e = anfrage.ergebnis;

  const [mitarbeiterId, setMitarbeiterId] = useState(e?.mitarbeiterId ?? "");
  const [stunden, setStunden] = useState(
    e?.neuStunden != null ? String(e.neuStunden) : ""
  );
  const [ausmass, setAusmass] = useState(
    e?.ausmassProzent != null ? String(e.ausmassProzent) : ""
  );
  const [gueltigAb, setGueltigAb] = useState(e?.gueltigAb ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function bestaetigen() {
    setFehler(null);
    const std = Number(stunden.replace(",", "."));
    const aus = Number(ausmass.replace(",", "."));
    if (!mitarbeiterId) {
      setFehler("Bitte Mitarbeiter auswählen.");
      return;
    }
    if (!Number.isFinite(std) || std <= 0) {
      setFehler("Bitte gültige Wochenstunden eingeben.");
      return;
    }
    if (!Number.isFinite(aus) || aus <= 0 || aus > 100) {
      setFehler("Bitte gültiges Ausmaß (1–100 %) eingeben.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gueltigAb)) {
      setFehler("Bitte gültiges Datum wählen.");
      return;
    }

    setArbeitet(true);
    try {
      await api.post(`/api/anfragen/${anfrage.id}/bestaetigen`, {
        mitarbeiterId,
        wochenstunden: std,
        ausmassProzent: aus,
        gueltigAb,
      });
      onAktualisiert();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setArbeitet(false);
    }
  }

  async function ablehnen() {
    setArbeitet(true);
    try {
      await api.post(`/api/anfragen/${anfrage.id}/ablehnen`, {});
      onAktualisiert();
    } finally {
      setArbeitet(false);
    }
  }

  const konfidenzProzent =
    anfrage.konfidenz != null ? Math.round(anfrage.konfidenz * 100) : null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm text-gray-700 italic">„{anfrage.rohtext}"</p>
          <div className="flex gap-3 mt-2 text-xs text-gray-400">
            <span>{anfrage.quelle}</span>
            {konfidenzProzent !== null && (
              <span>Konfidenz: {konfidenzProzent} %</span>
            )}
            {anfrage.status === "FEHLER" && (
              <span className="text-red-500">Fehler bei der Auswertung</span>
            )}
            {anfrage.status === "ZUR_BESTAETIGUNG" &&
              anfrage.ergebnis === null && <span>—</span>}
          </div>
          {e?.hinweis && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2 inline-block">
              {e.hinweis}
            </p>
          )}
        </div>
      </div>

      {darfBearbeiten && anfrage.status !== "FEHLER" && (
        <div className="mt-4 grid grid-cols-4 gap-3 items-end border-t border-gray-100 pt-4">
          <div className="col-span-1">
            <label className="block text-xs text-gray-500 mb-1">
              Mitarbeiter
            </label>
            <select
              value={mitarbeiterId}
              onChange={(ev) => setMitarbeiterId(ev.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">– wählen –</option>
              {mitarbeiter.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nachname}, {m.vorname}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Wochenstunden
            </label>
            <input
              value={stunden}
              onChange={(ev) => setStunden(ev.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ausmaß %</label>
            <input
              value={ausmass}
              onChange={(ev) => setAusmass(ev.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Gültig ab</label>
            <DatumEingabe
              value={gueltigAb}
              onChange={setGueltigAb}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>

          {fehler && (
            <p className="col-span-4 text-sm text-red-600">{fehler}</p>
          )}

          <div className="col-span-4 flex gap-2">
            <button
              onClick={bestaetigen}
              disabled={arbeitet}
              className="bg-green-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Bestätigen & übernehmen
            </button>
            <button
              onClick={ablehnen}
              disabled={arbeitet}
              className="bg-gray-200 text-gray-700 rounded px-4 py-2 text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
            >
              Ablehnen
            </button>
          </div>
        </div>
      )}

      {anfrage.status === "FEHLER" && darfBearbeiten && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <button
            onClick={ablehnen}
            disabled={arbeitet}
            className="bg-gray-200 text-gray-700 rounded px-4 py-2 text-sm font-medium hover:bg-gray-300"
          >
            Verwerfen
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verarbeitungs-Karte (Personalverrechnung): als verarbeitet markieren oder
// zurück an HR geben.
// ---------------------------------------------------------------------------
function VerarbeitungKarte({
  anfrage,
  darfVerarbeiten,
  onAktualisiert,
}: {
  anfrage: Anfrage;
  darfVerarbeiten: boolean;
  onAktualisiert: () => void;
}) {
  const e = anfrage.ergebnis;
  const [arbeitet, setArbeitet] = useState(false);
  const [zeigeZurueck, setZeigeZurueck] = useState(false);
  const [grund, setGrund] = useState("");

  async function verarbeiten() {
    setArbeitet(true);
    try {
      await api.post(`/api/anfragen/${anfrage.id}/verarbeiten`, {});
      onAktualisiert();
    } finally {
      setArbeitet(false);
    }
  }

  async function zurueck() {
    setArbeitet(true);
    try {
      await api.post(`/api/anfragen/${anfrage.id}/zurueck`, {
        grund: grund || undefined,
      });
      onAktualisiert();
    } finally {
      setArbeitet(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm text-gray-700 italic">„{anfrage.rohtext}"</p>
          <div className="mt-2 text-sm">
            <span className="font-medium text-gray-800">
              {anfrage.mitarbeiterName ?? "—"}
            </span>
            {e && (
              <span className="text-gray-600">
                {" · "}
                {e.neuStunden != null && `${e.neuStunden} Std`}
                {e.ausmassProzent != null && ` · ${e.ausmassProzent} %`}
                {e.gueltigAb && ` · ab ${datumDe(e.gueltigAb)}`}
              </span>
            )}
          </div>
          {anfrage.bearbeitetAm && (
            <p className="text-xs text-gray-400 mt-1">
              bestätigt am {datumZeitstempelDe(anfrage.bearbeitetAm)}
            </p>
          )}
        </div>
        <span className="text-xs bg-green-50 text-green-700 rounded px-2 py-0.5 whitespace-nowrap">
          bestätigt
        </span>
      </div>

      {darfVerarbeiten && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          {!zeigeZurueck ? (
            <div className="flex gap-2">
              <button
                onClick={verarbeiten}
                disabled={arbeitet}
                className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Als verarbeitet markieren
              </button>
              <button
                onClick={() => setZeigeZurueck(true)}
                disabled={arbeitet}
                className="bg-gray-200 text-gray-700 rounded px-4 py-2 text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
              >
                Zurück an HR
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Die Änderung wird rückgängig gemacht und geht zurück in den
                Eingang. Grund (optional):
              </p>
              <input
                value={grund}
                onChange={(ev) => setGrund(ev.target.value)}
                placeholder="z. B. Datum stimmt nicht mit Vertrag überein"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={zurueck}
                  disabled={arbeitet}
                  className="bg-amber-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                >
                  Zurückgeben
                </button>
                <button
                  onClick={() => setZeigeZurueck(false)}
                  disabled={arbeitet}
                  className="bg-gray-200 text-gray-700 rounded px-4 py-2 text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
