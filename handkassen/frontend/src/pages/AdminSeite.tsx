import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { formatCent, euroStringZuCent, formatProzent } from "../lib/geld.js";

// ============================================================
//  Gemeinsame kleine Bausteine
// ============================================================

function Karte({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow p-5 mb-6">
      <h2 className="font-semibold text-marke-900 mb-4">{titel}</h2>
      {children}
    </div>
  );
}

function Fehlerzeile({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
      {text}
    </div>
  );
}

function StatusKnopf({ aktiv, onClick }: { aktiv: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded ${
        aktiv ? "text-red-600 hover:bg-red-50" : "text-green-700 hover:bg-green-50"
      }`}
    >
      {aktiv ? "deaktivieren" : "aktivieren"}
    </button>
  );
}

// Bearbeiten-Link (startet den Inline-Bearbeitungsmodus einer Zeile)
function BearbeitenKnopf({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs text-marke-700 hover:underline">
      bearbeiten
    </button>
  );
}

// Speichern/Abbrechen-Paar im Inline-Bearbeitungsmodus
function SpeichernAbbrechen({ onSpeichern, onAbbrechen }: { onSpeichern: () => void; onAbbrechen: () => void }) {
  return (
    <>
      <button onClick={onSpeichern} className="text-xs text-marke-700 font-medium hover:underline">speichern</button>
      <button onClick={onAbbrechen} className="text-xs text-slate-500 hover:underline">abbrechen</button>
    </>
  );
}

// Einheitliche, kompakte Eingabefelder für die Inline-Bearbeitung in Tabellen
const zelleInput = "w-full border rounded px-2 py-1 text-sm";

// ============================================================
//  TAB: Benutzer (inkl. Kostenstellen-Zuweisung)
// ============================================================

interface Benutzer {
  id: number;
  benutzername: string;
  name: string;
  rolle: string;
  aktiv: boolean;
  passwortSetzen: boolean;
  kostenstellen: { kostenstelleId: number }[];
}
interface Kostenstelle {
  id: number;
  nummer: string;
  bezeichnung: string;
  gegenkonto: string | null;
  bereichId: number;
  kassenartId: number;
  bereich: { id: number; bezeichnung: string };
  kassenart: { id: number; bezeichnung: string };
  anfangssaldoCent: number;
  saldoCent: number;
  aktiv: boolean;
  belegStartnummer: number | null;
  belegStartJahr: number | null;
}
// Stammdaten-Eintrag für Bereich bzw. Kassenart
interface Stammwert { id: number; bezeichnung: string; aktiv: boolean; }

function BenutzerTab() {
  const [benutzer, setBenutzer] = useState<Benutzer[]>([]);
  const [kostenstellen, setKostenstellen] = useState<Kostenstelle[]>([]);
  const [fehler, setFehler] = useState("");

  // Zuweisungs-Dialog (Kostenstellen je Benutzer – Handkassen-spezifisch)
  const [zuweisung, setZuweisung] = useState<Benutzer | null>(null);
  const [ausgewaehlt, setAusgewaehlt] = useState<number[]>([]);
  // Filter
  const [suche, setSuche] = useState("");
  const [rolleFilter, setRolleFilter] = useState("");

  function laden() {
    api.get<Benutzer[]>("/admin/benutzer").then(setBenutzer).catch(() => {});
    api.get<Kostenstelle[]>("/admin/kostenstellen").then(setKostenstellen).catch(() => {});
  }
  useEffect(laden, []);

  function zuweisungOeffnen(b: Benutzer) {
    setZuweisung(b);
    setAusgewaehlt(b.kostenstellen.map((k) => k.kostenstelleId));
  }
  async function zuweisungSpeichern() {
    if (!zuweisung) return;
    await api.put(`/admin/benutzer/${zuweisung.id}/kostenstellen`, { kostenstellenIds: ausgewaehlt })
      .catch((e) => setFehler((e as Error).message));
    setZuweisung(null);
    laden();
  }

  const gefiltert = benutzer.filter((b) => {
    if (rolleFilter && b.rolle !== rolleFilter) return false;
    if (suche.trim()) {
      const text = suche.trim().toLowerCase();
      if (!b.benutzername.toLowerCase().includes(text) && !b.name.toLowerCase().includes(text)) return false;
    }
    return true;
  });

  return (
    <>
      <Karte titel="Kassen-Zugriff je Benutzer">
        <Fehlerzeile text={fehler} />
        <p className="text-sm text-slate-600 mb-4">
          Benutzer, Rollen und der grundsätzliche Zugang zu Handkassen werden
          zentral im <a href="/" className="text-marke-700 hover:underline">Portal (Verwaltung)</a>{" "}
          gepflegt. Hier legen Sie fest, welche Kostenstellen ein Benutzer
          bearbeiten darf (gilt nicht für Admin/Finanzen – die sehen alle).
        </p>

        <div className="mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Suche (Benutzername, Name)</label>
            <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="Suchbegriff…"
              value={suche} onChange={(e) => setSuche(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Rolle</label>
            <select className="border rounded px-3 py-1.5 text-sm" value={rolleFilter}
              onChange={(e) => setRolleFilter(e.target.value)}>
              <option value="">Alle</option>
              <option value="erfasser">Erfasser</option>
              <option value="leitung">Leitung</option>
              <option value="finanzen">Finanzen</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <span className="ml-auto text-xs text-slate-500 pb-1.5">
            {gefiltert.length} von {benutzer.length} Benutzern
          </span>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Benutzername</th><th>Name</th><th>Rolle</th><th>Status</th><th>Kassen</th><th></th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((b) => (
              <tr key={b.id} className="border-b last:border-0">
                <td className="py-2">{b.benutzername}</td>
                <td>{b.name}</td>
                <td>{b.rolle}</td>
                <td>
                  {b.aktiv ? <span className="text-green-700">aktiv</span> : <span className="text-slate-500">inaktiv</span>}
                </td>
                <td>{b.kostenstellen.length}</td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={() => zuweisungOeffnen(b)} className="text-xs text-marke-700 hover:underline">
                    Kassen zuordnen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>

      {zuweisung && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-10">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="font-semibold text-marke-900 mb-1">Kostenstellen für {zuweisung.name}</h3>
            <p className="text-sm text-slate-500 mb-4">Welche Kassen darf dieser Benutzer bearbeiten?</p>
            <div className="max-h-64 overflow-auto space-y-2 mb-4">
              {kostenstellen.filter((k) => k.aktiv).map((k) => (
                <label key={k.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ausgewaehlt.includes(k.id)}
                    onChange={(e) =>
                      setAusgewaehlt((alt) =>
                        e.target.checked ? [...alt, k.id] : alt.filter((x) => x !== k.id)
                      )
                    }
                  />
                  {k.bezeichnung} <span className="text-slate-500">({k.bereich.bezeichnung})</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setZuweisung(null)} className="px-3 py-2 text-sm text-slate-600 hover:underline">Abbrechen</button>
              <button onClick={zuweisungSpeichern} className="bg-marke-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-800">Speichern</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
//  TAB: Kostenstellen
// ============================================================

function KostenstellenTab() {
  const [liste, setListe] = useState<Kostenstelle[]>([]);
  const [bereiche, setBereiche] = useState<Stammwert[]>([]);
  const [kassenarten, setKassenarten] = useState<Stammwert[]>([]);
  const [fehler, setFehler] = useState("");
  const [neu, setNeu] = useState({ nummer: "", bezeichnung: "", gegenkonto: "", bereichId: 0, kassenartId: 0, anfangssaldo: "", belegStartnummer: "", belegStartJahr: String(new Date().getFullYear()) });
  // Inline-Bearbeitung
  const [bearbeiteId, setBearbeiteId] = useState<number | null>(null);
  const [entwurf, setEntwurf] = useState({ nummer: "", bezeichnung: "", gegenkonto: "", bereichId: 0, kassenartId: 0, anfangssaldo: "", belegStartnummer: "", belegStartJahr: "" });

  function laden() {
    api.get<Kostenstelle[]>("/admin/kostenstellen").then(setListe).catch(() => {});
    api.get<Stammwert[]>("/admin/bereiche").then(setBereiche).catch(() => {});
    api.get<Stammwert[]>("/admin/kassenarten").then(setKassenarten).catch(() => {});
  }
  useEffect(laden, []);

  // Nur aktive Stammwerte zur Auswahl anbieten (deaktivierte bleiben in Altdaten erhalten)
  const aktiveBereiche = bereiche.filter((b) => b.aktiv);
  const aktiveArten = kassenarten.filter((a) => a.aktiv);

  async function anlegen() {
    setFehler("");
    if (!neu.nummer.trim()) { setFehler("Bitte eine Kostenstellen-Nummer eingeben."); return; }
    if (!neu.gegenkonto.trim()) { setFehler("Bitte ein Gegenkonto (BMD) eingeben."); return; }
    if (!neu.bereichId || !neu.kassenartId) { setFehler("Bitte Bereich und Art wählen."); return; }
    try {
      await api.post("/admin/kostenstellen", {
        nummer: neu.nummer.trim(),
        bezeichnung: neu.bezeichnung,
        gegenkonto: neu.gegenkonto.trim(),
        bereichId: neu.bereichId,
        kassenartId: neu.kassenartId,
        anfangssaldoCent: neu.anfangssaldo ? euroStringZuCent(neu.anfangssaldo) : 0,
        ...(neu.belegStartnummer.trim()
          ? { belegStartnummer: Number(neu.belegStartnummer), belegStartJahr: Number(neu.belegStartJahr) }
          : {}),
      });
      setNeu({ nummer: "", bezeichnung: "", gegenkonto: "", bereichId: 0, kassenartId: 0, anfangssaldo: "", belegStartnummer: "", belegStartJahr: String(new Date().getFullYear()) });
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  async function aktivSchalten(k: Kostenstelle) {
    await api.post(`/admin/kostenstellen/${k.id}/aktiv`, { aktiv: !k.aktiv }).catch((e) => setFehler((e as Error).message));
    laden();
  }
  function bearbeitenStarten(k: Kostenstelle) {
    setFehler("");
    setBearbeiteId(k.id);
    setEntwurf({
      nummer: k.nummer,
      bezeichnung: k.bezeichnung,
      gegenkonto: k.gegenkonto ?? "",
      bereichId: k.bereichId,
      kassenartId: k.kassenartId,
      anfangssaldo: (k.anfangssaldoCent / 100).toFixed(2).replace(".", ","),
      belegStartnummer: k.belegStartnummer != null ? String(k.belegStartnummer) : "",
      belegStartJahr: k.belegStartJahr != null ? String(k.belegStartJahr) : String(new Date().getFullYear()),
    });
  }
  async function bearbeitenSpeichern(id: number) {
    setFehler("");
    const cent = entwurf.anfangssaldo ? euroStringZuCent(entwurf.anfangssaldo) : 0;
    if (isNaN(cent)) { setFehler("Ungültiger Anfangssaldo."); return; }
    if (!entwurf.gegenkonto.trim()) { setFehler("Bitte ein Gegenkonto (BMD) eingeben."); return; }
    try {
      await api.put(`/admin/kostenstellen/${id}`, {
        nummer: entwurf.nummer.trim(),
        bezeichnung: entwurf.bezeichnung,
        gegenkonto: entwurf.gegenkonto.trim(),
        bereichId: entwurf.bereichId,
        kassenartId: entwurf.kassenartId,
        anfangssaldoCent: cent,
        belegStartnummer: entwurf.belegStartnummer.trim() ? Number(entwurf.belegStartnummer) : null,
        belegStartJahr: entwurf.belegStartnummer.trim() ? Number(entwurf.belegStartJahr) : null,
      });
      setBearbeiteId(null);
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  return (
    <>
      <Karte titel="Neue Kostenstelle anlegen">
        <Fehlerzeile text={fehler} />
        <div className="grid grid-cols-8 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Nummer</label>
            <input className="w-full border rounded px-3 py-2" placeholder="z. B. 1260" value={neu.nummer}
              onChange={(e) => setNeu({ ...neu, nummer: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Gegenkonto (BMD)</label>
            <input className="w-full border rounded px-3 py-2" placeholder="z. B. 99957" value={neu.gegenkonto}
              onChange={(e) => setNeu({ ...neu, gegenkonto: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Bezeichnung</label>
            <input className="w-full border rounded px-3 py-2" value={neu.bezeichnung}
              onChange={(e) => setNeu({ ...neu, bezeichnung: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bereich</label>
            <select className="w-full border rounded px-3 py-2" value={neu.bereichId}
              onChange={(e) => setNeu({ ...neu, bereichId: Number(e.target.value) })}>
              <option value={0}>wählen…</option>
              {aktiveBereiche.map((b) => <option key={b.id} value={b.id}>{b.bezeichnung}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Art</label>
            <select className="w-full border rounded px-3 py-2" value={neu.kassenartId}
              onChange={(e) => setNeu({ ...neu, kassenartId: Number(e.target.value) })}>
              <option value={0}>wählen…</option>
              {aktiveArten.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Anfangssaldo €</label>
            <input className="w-full border rounded px-3 py-2 text-right" placeholder="0,00" value={neu.anfangssaldo}
              onChange={(e) => setNeu({ ...neu, anfangssaldo: e.target.value })} />
          </div>
          <button onClick={anlegen} className="bg-marke-700 text-white rounded py-2 font-medium hover:bg-marke-800">Anlegen</button>
        </div>
        <div className="grid grid-cols-8 gap-3 items-end mt-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Start-Belegnummer (optional)</label>
            <input className="w-full border rounded px-3 py-2 text-right" placeholder="z. B. 48" value={neu.belegStartnummer}
              onChange={(e) => setNeu({ ...neu, belegStartnummer: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">gilt für Jahr</label>
            <input className="w-full border rounded px-3 py-2 text-right" value={neu.belegStartJahr}
              onChange={(e) => setNeu({ ...neu, belegStartJahr: e.target.value })} />
          </div>
          <p className="col-span-5 text-xs text-slate-500 self-center">
            Für die unterjährige Umstellung: die erste Buchung dieser Kassa im angegebenen Jahr erhält diese laufende Nummer.
          </p>
        </div>
        {(aktiveBereiche.length === 0 || aktiveArten.length === 0) && (
          <p className="text-xs text-amber-600 mt-2">
            Hinweis: Es muss mindestens ein aktiver Bereich und eine aktive Art vorhanden sein.
            Diese pflegen Sie unter „Stammdaten“ in „Bereiche“ und „Kassenarten“.
          </p>
        )}
      </Karte>

      <Karte titel="Kostenstellen">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Nummer</th><th>Bezeichnung</th><th>Gegenkonto</th><th>Bereich</th><th>Art</th>
              <th className="text-right">Anfangssaldo</th><th className="text-right">akt. Saldo</th><th>Start-Beleg</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {liste.map((k) => {
              const imEdit = bearbeiteId === k.id;
              return (
              <tr key={k.id} className="border-b last:border-0">
                <td className="py-2">
                  {imEdit ? (
                    <input className={zelleInput} value={entwurf.nummer}
                      onChange={(e) => setEntwurf({ ...entwurf, nummer: e.target.value })} />
                  ) : k.nummer}
                </td>
                <td>
                  {imEdit ? (
                    <input className={zelleInput} value={entwurf.bezeichnung}
                      onChange={(e) => setEntwurf({ ...entwurf, bezeichnung: e.target.value })} />
                  ) : k.bezeichnung}
                </td>
                <td>
                  {imEdit ? (
                    <input className={zelleInput} value={entwurf.gegenkonto}
                      onChange={(e) => setEntwurf({ ...entwurf, gegenkonto: e.target.value })} />
                  ) : (k.gegenkonto || <span className="text-amber-600">fehlt</span>)}
                </td>
                <td>
                  {imEdit ? (
                    <select className={zelleInput} value={entwurf.bereichId}
                      onChange={(e) => setEntwurf({ ...entwurf, bereichId: Number(e.target.value) })}>
                      {aktiveBereiche.map((b) => <option key={b.id} value={b.id}>{b.bezeichnung}</option>)}
                    </select>
                  ) : k.bereich.bezeichnung}
                </td>
                <td>
                  {imEdit ? (
                    <select className={zelleInput} value={entwurf.kassenartId}
                      onChange={(e) => setEntwurf({ ...entwurf, kassenartId: Number(e.target.value) })}>
                      {aktiveArten.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}</option>)}
                    </select>
                  ) : k.kassenart.bezeichnung}
                </td>
                <td className="text-right">
                  {imEdit ? (
                    <input className={`${zelleInput} text-right`} value={entwurf.anfangssaldo}
                      onChange={(e) => setEntwurf({ ...entwurf, anfangssaldo: e.target.value })} />
                  ) : formatCent(k.anfangssaldoCent)}
                </td>
                <td className="text-right">{formatCent(k.saldoCent)}</td>
                <td>
                  {imEdit ? (
                    <div className="flex gap-1">
                      <input className={`${zelleInput} w-16 text-right`} placeholder="Nr." value={entwurf.belegStartnummer}
                        onChange={(e) => setEntwurf({ ...entwurf, belegStartnummer: e.target.value })} />
                      <input className={`${zelleInput} w-16 text-right`} placeholder="Jahr" value={entwurf.belegStartJahr}
                        onChange={(e) => setEntwurf({ ...entwurf, belegStartJahr: e.target.value })} />
                    </div>
                  ) : (k.belegStartnummer != null ? `${k.belegStartnummer} (${k.belegStartJahr})` : <span className="text-slate-400">–</span>)}
                </td>
                <td>{k.aktiv ? <span className="text-green-700">aktiv</span> : <span className="text-slate-500">inaktiv</span>}</td>
                <td className="text-right space-x-2 whitespace-nowrap">
                  {imEdit ? (
                    <SpeichernAbbrechen onSpeichern={() => bearbeitenSpeichern(k.id)} onAbbrechen={() => setBearbeiteId(null)} />
                  ) : (
                    <>
                      <BearbeitenKnopf onClick={() => bearbeitenStarten(k)} />
                      <StatusKnopf aktiv={k.aktiv} onClick={() => aktivSchalten(k)} />
                    </>
                  )}
                </td>
              </tr>
            );})}
          </tbody>
        </table>
        <p className="text-xs text-slate-500 mt-3">
          Hinweis: Wird der Anfangssaldo geändert, verschiebt sich der laufende Saldo um dieselbe Differenz.
        </p>
      </Karte>
    </>
  );
}

// ============================================================
//  TAB: Steuersätze
// ============================================================

interface Steuersatz { id: number; prozent: number; bezeichnung: string; aktiv: boolean; }

function SteuersaetzeTab() {
  const [liste, setListe] = useState<Steuersatz[]>([]);
  const [fehler, setFehler] = useState("");
  const [neu, setNeu] = useState({ prozent: "", bezeichnung: "" });

  function laden() {
    api.get<Steuersatz[]>("/admin/steuersaetze").then(setListe).catch(() => {});
  }
  useEffect(laden, []);

  async function anlegen() {
    setFehler("");
    const roh = parseFloat(neu.prozent.replace(",", "."));
    if (isNaN(roh)) { setFehler("Bitte einen gültigen Prozentwert eingeben."); return; }
    const prozent = Math.round(roh * 10) / 10;
    try {
      await api.post("/admin/steuersaetze", { prozent, bezeichnung: neu.bezeichnung });
      setNeu({ prozent: "", bezeichnung: "" });
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  async function aktivSchalten(s: Steuersatz) {
    await api.post(`/admin/steuersaetze/${s.id}/aktiv`, { aktiv: !s.aktiv }).catch((e) => setFehler((e as Error).message));
    laden();
  }

  return (
    <>
      <Karte titel="Neuen Steuersatz anlegen">
        <Fehlerzeile text={fehler} />
        <div className="grid grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Prozent</label>
            <input className="w-full border rounded px-3 py-2 text-right" placeholder="z. B. 13 oder 4,9" value={neu.prozent}
              onChange={(e) => setNeu({ ...neu, prozent: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Bezeichnung</label>
            <input className="w-full border rounded px-3 py-2" value={neu.bezeichnung}
              onChange={(e) => setNeu({ ...neu, bezeichnung: e.target.value })} />
          </div>
          <button onClick={anlegen} className="bg-marke-700 text-white rounded py-2 font-medium hover:bg-marke-800">Anlegen</button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Deaktivierte Sätze stehen bei neuen Buchungen nicht mehr zur Auswahl, bleiben aber für Altbuchungen erhalten.
        </p>
      </Karte>

      <Karte titel="Steuersätze">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Prozent</th><th>Bezeichnung</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {liste.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-2">{formatProzent(s.prozent)} %</td>
                <td>{s.bezeichnung}</td>
                <td>{s.aktiv ? <span className="text-green-700">aktiv</span> : <span className="text-slate-500">inaktiv</span>}</td>
                <td className="text-right"><StatusKnopf aktiv={s.aktiv} onClick={() => aktivSchalten(s)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </>
  );
}

// ============================================================
//  TAB: Kontenplan
// ============================================================

interface Konto { id: number; nummer: string; bezeichnung: string; beschreibung?: string; anmerkung?: string; aktiv: boolean; bereichIds: number[]; }

function KontenTab() {
  const [liste, setListe] = useState<Konto[]>([]);
  const [bereiche, setBereiche] = useState<Stammwert[]>([]);
  const [fehler, setFehler] = useState("");
  const [neu, setNeu] = useState<{ nummer: string; bezeichnung: string; beschreibung: string; anmerkung: string; bereichIds: number[] }>({ nummer: "", bezeichnung: "", beschreibung: "", anmerkung: "", bereichIds: [] });
  // Inline-Bearbeitung
  const [bearbeiteId, setBearbeiteId] = useState<number | null>(null);
  const [entwurf, setEntwurf] = useState<{ bezeichnung: string; beschreibung: string; anmerkung: string; bereichIds: number[] }>({ bezeichnung: "", beschreibung: "", anmerkung: "", bereichIds: [] });

  function laden() {
    api.get<Konto[]>("/admin/konten").then(setListe).catch(() => {});
    api.get<Stammwert[]>("/admin/bereiche").then(setBereiche).catch(() => {});
  }
  useEffect(laden, []);

  async function anlegen() {
    setFehler("");
    try {
      await api.post("/admin/konten", neu);
      setNeu({ nummer: "", bezeichnung: "", beschreibung: "", anmerkung: "", bereichIds: [] });
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  async function aktivSchalten(k: Konto) {
    await api.post(`/admin/konten/${k.id}/aktiv`, { aktiv: !k.aktiv }).catch((e) => setFehler((e as Error).message));
    laden();
  }
  function bearbeitenStarten(k: Konto) {
    setFehler("");
    setBearbeiteId(k.id);
    setEntwurf({ bezeichnung: k.bezeichnung, beschreibung: k.beschreibung ?? "", anmerkung: k.anmerkung ?? "", bereichIds: k.bereichIds });
  }
  async function bearbeitenSpeichern(id: number) {
    setFehler("");
    try {
      await api.put(`/admin/konten/${id}`, {
        bezeichnung: entwurf.bezeichnung,
        beschreibung: entwurf.beschreibung,
        anmerkung: entwurf.anmerkung,
        bereichIds: entwurf.bereichIds,
      });
      setBearbeiteId(null);
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  const aktiveBereiche = bereiche.filter((b) => b.aktiv);
  function toggle(ids: number[], id: number): number[] {
    return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  }

  return (
    <>
      <Karte titel="Neues Konto anlegen">
        <Fehlerzeile text={fehler} />
        <div className="grid grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Nummer</label>
            <input className="w-full border rounded px-3 py-2" value={neu.nummer}
              onChange={(e) => setNeu({ ...neu, nummer: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Bezeichnung</label>
            <input className="w-full border rounded px-3 py-2" value={neu.bezeichnung}
              onChange={(e) => setNeu({ ...neu, bezeichnung: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Beschreibung</label>
            <input className="w-full border rounded px-3 py-2" value={neu.beschreibung}
              onChange={(e) => setNeu({ ...neu, beschreibung: e.target.value })} />
          </div>
          <div className="col-span-5">
            <label className="block text-sm font-medium mb-1">Freigegeben für Bereiche</label>
            <div className="flex flex-wrap gap-3">
              {aktiveBereiche.map((b) => (
                <label key={b.id} className="inline-flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={neu.bereichIds.includes(b.id)}
                    onChange={() => setNeu({ ...neu, bereichIds: toggle(neu.bereichIds, b.id) })} />
                  {b.bezeichnung}
                </label>
              ))}
            </div>
          </div>
          <button onClick={anlegen} className="bg-marke-700 text-white rounded py-2 font-medium hover:bg-marke-800">Anlegen</button>
        </div>
      </Karte>

      <Karte titel="Kontenplan">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Nummer</th><th>Bezeichnung</th><th>Beschreibung</th><th>Bereiche</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {liste.map((k) => {
              const imEdit = bearbeiteId === k.id;
              return (
              <tr key={k.id} className="border-b last:border-0">
                <td className="py-2">{k.nummer}</td>
                <td>
                  {imEdit ? (
                    <input className={zelleInput} value={entwurf.bezeichnung}
                      onChange={(e) => setEntwurf({ ...entwurf, bezeichnung: e.target.value })} />
                  ) : k.bezeichnung}
                </td>
                <td className="text-slate-500">
                  {imEdit ? (
                    <input className={zelleInput} value={entwurf.beschreibung}
                      onChange={(e) => setEntwurf({ ...entwurf, beschreibung: e.target.value })} />
                  ) : (k.beschreibung || "–")}
                </td>
                <td className="text-slate-500">
                  {imEdit ? (
                    <div className="flex flex-wrap gap-2">
                      {aktiveBereiche.map((b) => (
                        <label key={b.id} className="inline-flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={entwurf.bereichIds.includes(b.id)}
                            onChange={() => setEntwurf({ ...entwurf, bereichIds: toggle(entwurf.bereichIds, b.id) })} />
                          {b.bezeichnung}
                        </label>
                      ))}
                    </div>
                  ) : (
                    k.bereichIds.length
                      ? bereiche.filter((b) => k.bereichIds.includes(b.id)).map((b) => b.bezeichnung).join(", ")
                      : <span className="text-amber-700">keine Freigabe</span>
                  )}
                </td>
                <td>{k.aktiv ? <span className="text-green-700">aktiv</span> : <span className="text-slate-500">inaktiv</span>}</td>
                <td className="text-right space-x-2 whitespace-nowrap">
                  {imEdit ? (
                    <SpeichernAbbrechen onSpeichern={() => bearbeitenSpeichern(k.id)} onAbbrechen={() => setBearbeiteId(null)} />
                  ) : (
                    <>
                      <BearbeitenKnopf onClick={() => bearbeitenStarten(k)} />
                      <StatusKnopf aktiv={k.aktiv} onClick={() => aktivSchalten(k)} />
                    </>
                  )}
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </Karte>
    </>
  );
}

// ============================================================
//  TAB: Bereiche / Arten (generisch – gleiche Struktur)
// ============================================================

// Wiederverwendbarer Tab für einfache Stammwerte mit nur einem Feld
// (Bezeichnung). Wird für „Bereiche“ und „Arten“ verwendet.
function StammwertTab({
  basis, titelEinzahl, titelMehrzahl,
}: {
  basis: string;          // API-Basis, z. B. "/admin/bereiche"
  titelEinzahl: string;   // z. B. "Bereich"
  titelMehrzahl: string;  // z. B. "Bereiche"
}) {
  const [liste, setListe] = useState<Stammwert[]>([]);
  const [fehler, setFehler] = useState("");
  const [neu, setNeu] = useState("");
  const [bearbeiteId, setBearbeiteId] = useState<number | null>(null);
  const [entwurf, setEntwurf] = useState("");

  function laden() {
    api.get<Stammwert[]>(basis).then(setListe).catch(() => {});
  }
  useEffect(laden, [basis]);

  async function anlegen() {
    setFehler("");
    if (!neu.trim()) { setFehler("Bitte eine Bezeichnung eingeben."); return; }
    try {
      await api.post(basis, { bezeichnung: neu.trim() });
      setNeu("");
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  async function aktivSchalten(s: Stammwert) {
    await api.post(`${basis}/${s.id}/aktiv`, { aktiv: !s.aktiv }).catch((e) => setFehler((e as Error).message));
    laden();
  }
  function bearbeitenStarten(s: Stammwert) {
    setFehler("");
    setBearbeiteId(s.id);
    setEntwurf(s.bezeichnung);
  }
  async function bearbeitenSpeichern(id: number) {
    setFehler("");
    if (!entwurf.trim()) { setFehler("Bitte eine Bezeichnung eingeben."); return; }
    try {
      await api.put(`${basis}/${id}`, { bezeichnung: entwurf.trim() });
      setBearbeiteId(null);
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  return (
    <>
      <Karte titel={`Neuen ${titelEinzahl} anlegen`}>
        <Fehlerzeile text={fehler} />
        <div className="grid grid-cols-4 gap-3 items-end">
          <div className="col-span-3">
            <label className="block text-sm font-medium mb-1">Bezeichnung</label>
            <input className="w-full border rounded px-3 py-2" value={neu}
              onChange={(e) => setNeu(e.target.value)} />
          </div>
          <button onClick={anlegen} className="bg-marke-700 text-white rounded py-2 font-medium hover:bg-marke-800">Anlegen</button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Deaktivierte Einträge stehen bei neuen Kostenstellen nicht mehr zur Auswahl,
          bleiben aber bei bestehenden Kostenstellen erhalten. Gelöscht wird nichts (revisionssicher).
        </p>
      </Karte>

      <Karte titel={titelMehrzahl}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Bezeichnung</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {liste.map((s) => {
              const imEdit = bearbeiteId === s.id;
              return (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-2">
                  {imEdit ? (
                    <input className={zelleInput} value={entwurf}
                      onChange={(e) => setEntwurf(e.target.value)} />
                  ) : s.bezeichnung}
                </td>
                <td>{s.aktiv ? <span className="text-green-700">aktiv</span> : <span className="text-slate-500">inaktiv</span>}</td>
                <td className="text-right space-x-2 whitespace-nowrap">
                  {imEdit ? (
                    <SpeichernAbbrechen onSpeichern={() => bearbeitenSpeichern(s.id)} onAbbrechen={() => setBearbeiteId(null)} />
                  ) : (
                    <>
                      <BearbeitenKnopf onClick={() => bearbeitenStarten(s)} />
                      <StatusKnopf aktiv={s.aktiv} onClick={() => aktivSchalten(s)} />
                    </>
                  )}
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </Karte>
    </>
  );
}

// ============================================================
//  TAB: Audit-Log
// ============================================================

interface AuditEintrag {
  id: number;
  zeitpunkt: string;
  aktion: string;
  entitaet: string;
  entitaetId?: number;
  benutzer?: { name: string; benutzername: string };
}

function AuditTab() {
  const [liste, setListe] = useState<AuditEintrag[]>([]);
  useEffect(() => {
    api.get<AuditEintrag[]>("/admin/audit?limit=300").then(setListe).catch(() => {});
  }, []);

  return (
    <Karte titel="Audit-Log (letzte 300 Einträge)">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            <th className="py-2">Zeitpunkt</th><th>Benutzer</th><th>Aktion</th><th>Objekt</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((e) => (
            <tr key={e.id} className="border-b last:border-0">
              <td className="py-2 whitespace-nowrap">{new Date(e.zeitpunkt).toLocaleString("de-AT")}</td>
              <td>{e.benutzer ? e.benutzer.benutzername : "–"}</td>
              <td className="font-mono text-xs">{e.aktion}</td>
              <td className="text-slate-500">{e.entitaet}{e.entitaetId ? ` #${e.entitaetId}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Karte>
  );
}

// ============================================================
//  TAB: Datensicherung (Backup)
// ============================================================

interface BackupKonfig {
  id: number;
  uhrzeit: string;
  aufbewahrungTaeglich: number;
  aufbewahrungMonatlich: number;
  zielNasAktiv: boolean;
  zielUsbAktiv: boolean;
  pfadLokal: string | null;
  laufAngefordert: boolean;
  letzterLaufAm: string | null;
  letzterErfolg: boolean;
  letzteMeldung: string | null;
  bericht: string | null;
}

interface BackupDatei { ordner: string; name: string; groesseBytes: number; erstelltAm: string; }

function dateiGroesse(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
  return bytes + " B";
}

function VerzeichnisBrowser({
  startPfad,
  onAuswaehlen,
  onAbbrechen,
}: {
  startPfad: string;
  onAuswaehlen: (pfad: string) => void;
  onAbbrechen: () => void;
}) {
  const [pfad, setPfad] = useState("");
  const [pfadEingabe, setPfadEingabe] = useState("");
  const [ordner, setOrdner] = useState<string[]>([]);
  const [elternpfad, setElternpfad] = useState<string | null>(null);
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function navigieren(ziel: string) {
    setLaeuft(true);
    setFehler("");
    try {
      const r = await api.get<{ pfad: string; ordner: string[]; elternpfad: string | null }>(
        `/admin/verzeichnis?pfad=${encodeURIComponent(ziel)}`
      );
      setPfad(r.pfad);
      setPfadEingabe(r.pfad);
      setOrdner(r.ordner);
      setElternpfad(r.elternpfad);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  useEffect(() => { navigieren(startPfad || ""); }, []);

  function unterordnerPfad(name: string): string {
    if (pfad === "") return name; // Windows-Laufwerksliste: name ist bereits vollständiger Pfad
    const sep = pfad.includes("\\") ? "\\" : "/";
    return pfad.endsWith(sep) ? pfad + name : pfad + sep + name;
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg flex flex-col" style={{ maxHeight: "80vh" }}>
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="font-semibold text-marke-900 text-sm flex-1">Ordner wählen</span>
          <button onClick={onAbbrechen} className="text-slate-500 hover:text-slate-700 text-xl leading-none">&times;</button>
        </div>

        <div className="px-3 py-2 border-b bg-slate-50 flex items-center gap-2">
          {elternpfad !== null && (
            <button onClick={() => navigieren(elternpfad)}
              className="text-xs px-2 py-1 rounded border bg-white hover:bg-slate-50 text-slate-600 whitespace-nowrap">
              ↑ Hoch
            </button>
          )}
          <input
            className="flex-1 text-xs font-mono border rounded px-2 py-1 bg-white"
            value={pfadEingabe}
            onChange={(e) => setPfadEingabe(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") navigieren(pfadEingabe); }}
            placeholder="Pfad eingeben und Enter drücken…"
          />
          <button onClick={() => navigieren(pfadEingabe)}
            className="text-xs px-2 py-1 rounded border bg-white hover:bg-slate-50 text-slate-600">
            →
          </button>
        </div>

        <div className="overflow-y-auto flex-1 py-1">
          {fehler && <p className="text-sm text-red-600 px-4 py-2">{fehler}</p>}
          {laeuft && <p className="text-sm text-slate-500 px-4 py-2">Lade…</p>}
          {!laeuft && !fehler && ordner.length === 0 && (
            <p className="text-sm text-slate-500 px-4 py-2">Keine Unterordner vorhanden.</p>
          )}
          {ordner.map((name) => (
            <button key={name} onClick={() => navigieren(unterordnerPfad(name))}
              className="w-full text-left px-4 py-1.5 text-sm hover:bg-marke-50 flex items-center gap-2">
              <svg className="h-4 w-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <span className="font-mono">{name}</span>
            </button>
          ))}
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500 font-mono truncate">{pfad || "—"}</span>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={onAbbrechen} className="px-3 py-1.5 text-sm text-slate-600 hover:underline">Abbrechen</button>
            <button onClick={() => onAuswaehlen(pfad)} disabled={!pfad}
              className="bg-marke-700 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-marke-800 disabled:opacity-50">
              Auswählen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackupTab() {
  const [konfig, setKonfig] = useState<BackupKonfig | null>(null);
  const [form, setForm] = useState({
    uhrzeit: "02:00",
    aufbewahrungTaeglich: "14",
    aufbewahrungMonatlich: "12",
    zielNasAktiv: true,
    zielUsbAktiv: true,
    pfadLokal: "",
  });
  const [fehler, setFehler] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [dateien, setDateien] = useState<BackupDatei[] | null>(null);
  const [dateienPfad, setDateienPfad] = useState("");
  const [pruef, setPruef] = useState<Record<string, { laeuft?: boolean; ok?: boolean; meldung?: string }>>({});
  const [browser, setBrowser] = useState<"lokal" | null>(null);

  function laden() {
    api.get<BackupKonfig>("/admin/backup").then((k) => {
      setKonfig(k);
      setForm({
        uhrzeit: k.uhrzeit,
        aufbewahrungTaeglich: String(k.aufbewahrungTaeglich),
        aufbewahrungMonatlich: String(k.aufbewahrungMonatlich),
        zielNasAktiv: k.zielNasAktiv,
        zielUsbAktiv: k.zielUsbAktiv,
        pfadLokal: k.pfadLokal ?? "",
      });
    }).catch(() => {});
  }
  useEffect(laden, []);

  async function speichern() {
    setFehler(""); setHinweis("");
    const t = parseInt(form.aufbewahrungTaeglich, 10);
    const m = parseInt(form.aufbewahrungMonatlich, 10);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.uhrzeit)) { setFehler("Uhrzeit im Format HH:MM angeben."); return; }
    if (isNaN(t) || t < 1) { setFehler("Aufbewahrung (täglich) muss mindestens 1 sein."); return; }
    if (isNaN(m) || m < 0) { setFehler("Aufbewahrung (monatlich) ist ungültig."); return; }
    try {
      await api.put("/admin/backup", {
        uhrzeit: form.uhrzeit,
        aufbewahrungTaeglich: t,
        aufbewahrungMonatlich: m,
        zielNasAktiv: form.zielNasAktiv,
        zielUsbAktiv: form.zielUsbAktiv,
        // null (nicht undefined) leert den Pfad in der DB zurück auf den Standard.
        pfadLokal: form.pfadLokal.trim() || null,
      });
      setHinweis("Einstellungen gespeichert.");
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  async function jetztSichern() {
    setFehler(""); setHinweis("");
    try {
      await api.post("/admin/backup/jetzt");
      setHinweis("Sicherung angefordert – sie wird innerhalb einer halben Minute ausgeführt. Danach auf „Aktualisieren“ klicken.");
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  function dateienLaden() {
    api.get<{ pfad: string; gefunden: boolean; dateien: BackupDatei[] }>("/admin/backup/dateien")
      .then((r) => { setDateien(r.dateien); setDateienPfad(r.pfad); })
      .catch((e) => setFehler((e as Error).message));
  }

  async function pruefen(d: BackupDatei) {
    const key = `${d.ordner}/${d.name}`;
    setPruef((p) => ({ ...p, [key]: { laeuft: true } }));
    try {
      const r = await api.post<{ ok: boolean; meldung: string }>("/admin/backup/pruefen", { ordner: d.ordner, name: d.name });
      setPruef((p) => ({ ...p, [key]: { ok: r.ok, meldung: r.meldung } }));
    } catch (e) {
      setPruef((p) => ({ ...p, [key]: { ok: false, meldung: (e as Error).message } }));
    }
  }

  return (
    <>
      <Karte titel="Status">
        <Fehlerzeile text={fehler} />
        {hinweis && (
          <div className="mb-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2">{hinweis}</div>
        )}
        {konfig && (
          <div className="space-y-2 text-sm">
            <div>
              Letzte Sicherung:{" "}
              {konfig.letzterLaufAm ? (
                <>
                  <span className="font-medium">{new Date(konfig.letzterLaufAm).toLocaleString("de-AT")}</span>{" "}
                  {konfig.letzterErfolg
                    ? <span className="text-green-700">erfolgreich</span>
                    : <span className="text-red-700">fehlgeschlagen</span>}
                </>
              ) : <span className="text-slate-500">noch keine</span>}
            </div>
            {konfig.letzteMeldung && <div className="text-slate-600">{konfig.letzteMeldung}</div>}
            {konfig.laufAngefordert && (
              <div className="text-amber-600">Eine Sicherung ist angefordert und wird in Kürze ausgeführt…</div>
            )}
            {konfig.bericht && (
              <pre className="mt-2 bg-slate-50 border rounded p-3 text-xs whitespace-pre-wrap text-slate-700">{konfig.bericht}</pre>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-3 items-center">
          <button onClick={jetztSichern} className="bg-marke-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-800">Jetzt sichern</button>
          <button onClick={laden} className="text-sm text-marke-700 hover:underline">Aktualisieren</button>
        </div>
      </Karte>

      <Karte titel="Sicherungen (lokal)">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={dateienLaden} className="bg-marke-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-800">
            {dateien === null ? "Sicherungen anzeigen" : "Aktualisieren"}
          </button>
          {dateienPfad && <span className="text-xs text-slate-500">Ordner: {dateienPfad}</span>}
        </div>

        {dateien !== null && dateien.length === 0 && (
          <p className="text-sm text-slate-500">Keine lokalen Sicherungen gefunden.</p>
        )}

        {dateien !== null && dateien.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Ablage</th><th>Datei</th><th className="text-right">Größe</th><th>Datum</th><th></th>
              </tr>
            </thead>
            <tbody>
              {dateien.map((d) => {
                const key = `${d.ordner}/${d.name}`;
                const p = pruef[key];
                return (
                  <tr key={key} className="border-b last:border-0 align-top">
                    <td className="py-2">{d.ordner}</td>
                    <td className="font-mono text-xs">{d.name}</td>
                    <td className="text-right whitespace-nowrap">{dateiGroesse(d.groesseBytes)}</td>
                    <td className="whitespace-nowrap">{new Date(d.erstelltAm).toLocaleString("de-AT")}</td>
                    <td className="text-right">
                      <button onClick={() => pruefen(d)} disabled={p?.laeuft}
                        className="text-xs text-marke-700 hover:underline disabled:opacity-60">
                        {p?.laeuft ? "prüfe…" : "prüfen"}
                      </button>
                      {p && !p.laeuft && p.meldung && (
                        <div className={`mt-1 text-xs text-left ${p.ok ? "text-green-700" : "text-red-600"}`}>
                          {p.ok ? "✓ " : "✗ "}{p.meldung}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-xs text-slate-500 mt-3">
          „prüfen“ kontrolliert, ob das Archiv lesbar ist und die erwarteten Inhalte
          (Datenbank + Info) enthält. NAS-/USB-Stände werden hier nicht aufgelistet.
        </p>
      </Karte>

      <Karte titel="Einstellungen">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Uhrzeit (täglich)</label>
            <input type="time" className="w-full border rounded px-3 py-2" value={form.uhrzeit}
              onChange={(e) => setForm({ ...form, uhrzeit: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Aufbewahrung täglich</label>
            <input type="number" min={1} className="w-full border rounded px-3 py-2 text-right" value={form.aufbewahrungTaeglich}
              onChange={(e) => setForm({ ...form, aufbewahrungTaeglich: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Aufbewahrung monatlich</label>
            <input type="number" min={0} className="w-full border rounded px-3 py-2 text-right" value={form.aufbewahrungMonatlich}
              onChange={(e) => setForm({ ...form, aufbewahrungMonatlich: e.target.value })} />
          </div>
          <button onClick={speichern} className="bg-marke-700 text-white rounded py-2 font-medium hover:bg-marke-800">Speichern</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.zielNasAktiv} onChange={(e) => setForm({ ...form, zielNasAktiv: e.target.checked })} />
            Auf NAS sichern
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.zielUsbAktiv} onChange={(e) => setForm({ ...form, zielUsbAktiv: e.target.checked })} />
            Auf USB sichern
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Es wird täglich um die eingestellte Uhrzeit gesichert. Jahresstände (jeweils 1. Jänner)
          bleiben dauerhaft erhalten – unabhängig von der Aufbewahrung der Tages- und Monatsstände.
        </p>
      </Karte>

      <Karte titel="Lokaler Anzeige-Pfad">
        <p className="text-sm text-slate-500 mb-4">
          Aus diesem Ordner liest die App die lokalen Sicherungen für die Liste und die Prüfung oben.
          Leer lassen, um den Server-Standardpfad (aus <code className="bg-slate-100 px-1 rounded">.env</code>) zu verwenden.
        </p>
        <div>
          <label className="block text-sm font-medium mb-1">Lokal</label>
          <div className="flex gap-2">
            <input className="flex-1 border rounded px-3 py-2 text-sm font-mono" placeholder="Standard aus .env"
              value={form.pfadLokal} onChange={(e) => setForm({ ...form, pfadLokal: e.target.value })} />
            <button type="button" onClick={() => setBrowser("lokal")}
              className="px-3 py-2 text-sm border rounded hover:bg-slate-50 whitespace-nowrap text-slate-600">
              Durchsuchen…
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Hinweis: <strong>Wohin</strong> gesichert wird (lokal, NAS, USB), wird am Server in der
          Datei <code className="bg-slate-100 px-1 rounded">.env</code> festgelegt – nicht hier.
          Dieser Pfad beeinflusst nur die Anzeige. Änderungen werden beim Klick auf „Speichern" übernommen.
        </p>
      </Karte>

      {browser !== null && (
        <VerzeichnisBrowser
          startPfad={form.pfadLokal}
          onAuswaehlen={(pfad) => {
            setForm((f) => ({ ...f, pfadLokal: pfad }));
            setBrowser(null);
          }}
          onAbbrechen={() => setBrowser(null)}
        />
      )}
    </>
  );
}

// ============================================================
//  TABS: Belege + Kassensperre (geteilt aus der frueheren "Allgemein")
// ============================================================

interface AllgemeinKonfig { id: number; sperrFristTage: number; belegPflicht: boolean; fotoMaxKantePx: number; fotoQualitaet: number; }
interface MonatStatus { monat: number; gesperrt: boolean; manuell: boolean; autoGesperrt: boolean; }
interface SperrenAntwort { kostenstelleId: number; jahr: number; sperrFristTage: number; monate: MonatStatus[]; }

const MONATSNAMEN = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function BelegeTab() {
  const [belegPflicht, setBelegPflicht] = useState(false);
  const [bpHinweis, setBpHinweis] = useState("");
  const [fotoMaxKante, setFotoMaxKante] = useState("1600");
  const [fotoQualitaet, setFotoQualitaet] = useState("80");
  const [fotoHinweis, setFotoHinweis] = useState("");
  const [fotoFehler, setFotoFehler] = useState("");

  useEffect(() => {
    api.get<AllgemeinKonfig>("/admin/allgemein").then((k) => {
      setBelegPflicht(!!k.belegPflicht);
      setFotoMaxKante(String(k.fotoMaxKantePx ?? 1600));
      setFotoQualitaet(String(k.fotoQualitaet ?? 80));
    }).catch(() => {});
  }, []);

  async function belegPflichtUmschalten(neu: boolean) {
    setBpHinweis("");
    setBelegPflicht(neu);
    try {
      await api.put("/admin/allgemein", { belegPflicht: neu });
      setBpHinweis(neu ? "Belegpflicht aktiviert." : "Belegpflicht deaktiviert.");
    } catch (e) {
      setBelegPflicht(!neu);
      setBpHinweis("Fehler: " + (e as Error).message);
    }
  }

  async function fotoSpeichern() {
    setFotoFehler(""); setFotoHinweis("");
    const kante = parseInt(fotoMaxKante, 10);
    const q = parseInt(fotoQualitaet, 10);
    if (isNaN(kante) || kante < 400 || kante > 4000) { setFotoFehler("Maximale Kantenlänge: 400 bis 4000 px."); return; }
    if (isNaN(q) || q < 30 || q > 100) { setFotoFehler("Qualität: 30 bis 100."); return; }
    try {
      await api.put("/admin/allgemein", { fotoMaxKantePx: kante, fotoQualitaet: q });
      setFotoHinweis("Gespeichert.");
    } catch (e) {
      setFotoFehler((e as Error).message);
    }
  }

  return (
    <>
      <Karte titel="Belegpflicht">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={belegPflicht} onChange={(e) => belegPflichtUmschalten(e.target.checked)} />
          <span>Buchungen nur mit angehängtem Beleg erlauben</span>
        </label>
        {bpHinweis && <div className="mt-2 text-sm text-green-800">{bpHinweis}</div>}
        <p className="text-xs text-slate-500 mt-3">
          Ist dies aktiv, kann eine Buchung (auch eine Korrektur) nur mit angehängtem Beleg gespeichert
          werden. Gilt für alle Kassen und alle Rollen.
        </p>
      </Karte>

      <Karte titel="Belegfotos – Auflösung">
        <Fehlerzeile text={fotoFehler} />
        {fotoHinweis && <div className="mb-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2">{fotoHinweis}</div>}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Max. Kantenlänge (px)</label>
            <input type="number" min={400} max={4000} step={100} className="w-40 border rounded px-3 py-2 text-right"
              value={fotoMaxKante} onChange={(e) => setFotoMaxKante(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">JPEG-Qualität (30–100)</label>
            <input type="number" min={30} max={100} className="w-40 border rounded px-3 py-2 text-right"
              value={fotoQualitaet} onChange={(e) => setFotoQualitaet(e.target.value)} />
          </div>
          <button onClick={fotoSpeichern} className="bg-marke-700 text-white rounded px-5 py-2 font-medium hover:bg-marke-800">Speichern</button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Beim Speichern eines Belegfotos wird die längere Bildkante auf diesen Wert begrenzt
          (kein Hochskalieren) und mit der gewählten JPEG-Qualität gespeichert. Kleinere Werte
          sparen Speicherplatz, größere erhalten mehr Details. Richtwert: 1600 px / 80 %.
        </p>
      </Karte>
    </>
  );
}

function KassensperreTab() {
  const [frist, setFrist] = useState("5");
  const [fehler, setFehler] = useState("");
  const [hinweis, setHinweis] = useState("");

  const [kostenstellen, setKostenstellen] = useState<Kostenstelle[]>([]);
  const [ksId, setKsId] = useState<number>(0);
  const [jahr, setJahr] = useState<number>(new Date().getFullYear());
  const [sperren, setSperren] = useState<SperrenAntwort | null>(null);
  const [sperrenFehler, setSperrenFehler] = useState("");

  function konfigLaden() {
    api.get<AllgemeinKonfig>("/admin/allgemein").then((k) => setFrist(String(k.sperrFristTage))).catch(() => {});
  }
  useEffect(konfigLaden, []);
  useEffect(() => {
    api.get<Kostenstelle[]>("/admin/kostenstellen").then((liste) => {
      setKostenstellen(liste);
      setKsId((alt) => alt || (liste[0]?.id ?? 0));
    }).catch(() => {});
  }, []);

  function sperrenLaden() {
    if (!ksId) return;
    setSperrenFehler("");
    api.get<SperrenAntwort>(`/admin/sperren?kostenstelle=${ksId}&jahr=${jahr}`)
      .then(setSperren)
      .catch((e) => setSperrenFehler((e as Error).message));
  }
  useEffect(sperrenLaden, [ksId, jahr]);

  async function fristSpeichern() {
    setFehler(""); setHinweis("");
    const tage = parseInt(frist, 10);
    if (isNaN(tage) || tage < 0 || tage > 366) { setFehler("Bitte eine Frist zwischen 0 und 366 Tagen angeben."); return; }
    try {
      await api.put("/admin/allgemein", { sperrFristTage: tage });
      setHinweis("Gespeichert.");
      sperrenLaden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  async function setzen(monat: number, modus: "sperren" | "entsperren" | "automatisch") {
    setSperrenFehler("");
    try {
      await api.put("/admin/sperren", { kostenstelleId: ksId, jahr, monat, modus });
      sperrenLaden();
    } catch (e) {
      setSperrenFehler((e as Error).message);
    }
  }

  return (
    <>
      <Karte titel="Monatssperre – Frist">
        <Fehlerzeile text={fehler} />
        {hinweis && <div className="mb-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2">{hinweis}</div>}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Frist nach Monatsende (Tage)</label>
            <input type="number" min={0} max={366} className="w-40 border rounded px-3 py-2 text-right"
              value={frist} onChange={(e) => setFrist(e.target.value)} />
          </div>
          <button onClick={fristSpeichern} className="bg-marke-700 text-white rounded px-5 py-2 font-medium hover:bg-marke-800">Speichern</button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Jede Kasse wird automatisch gesperrt, sobald nach dem Monatsende so viele Tage vergangen sind.
          Danach kann in diesem Monat nur noch ein Administrator buchen, stornieren oder korrigieren.
          Mit „0“ wird sofort mit dem Monatsende gesperrt.
        </p>
      </Karte>

      <Karte titel="Monate manuell sperren / entsperren">
        <Fehlerzeile text={sperrenFehler} />
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <div className="min-w-[240px]">
            <label className="block text-sm font-medium mb-1">Kasse</label>
            <select className="w-full border rounded px-3 py-2" value={ksId}
              onChange={(e) => setKsId(Number(e.target.value))}>
              {kostenstellen.map((k) => (
                <option key={k.id} value={k.id}>{k.nummer} – {k.bezeichnung}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Jahr</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setJahr(jahr - 1)} className="px-3 py-2 border rounded text-sm hover:bg-slate-50">‹</button>
              <span className="font-medium w-14 text-center">{jahr}</span>
              <button onClick={() => setJahr(jahr + 1)} className="px-3 py-2 border rounded text-sm hover:bg-slate-50">›</button>
            </div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Monat</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {sperren?.monate.map((m) => (
              <tr key={m.monat} className="border-b last:border-0">
                <td className="py-2">{MONATSNAMEN[m.monat - 1]}</td>
                <td>
                  {m.gesperrt
                    ? <span className="text-red-700 font-medium">gesperrt</span>
                    : <span className="text-green-700">offen</span>}
                  <span className="ml-2 text-xs text-slate-500">{m.manuell ? "(manuell)" : "(automatisch)"}</span>
                </td>
                <td className="text-right space-x-3 whitespace-nowrap">
                  {m.gesperrt
                    ? <button onClick={() => setzen(m.monat, "entsperren")} className="text-xs text-green-700 hover:underline">entsperren</button>
                    : <button onClick={() => setzen(m.monat, "sperren")} className="text-xs text-red-600 hover:underline">sperren</button>}
                  {m.manuell && (
                    <button onClick={() => setzen(m.monat, "automatisch")} className="text-xs text-marke-700 hover:underline">auf automatisch</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-500 mt-3">
          „sperren“/„entsperren“ überschreiben die automatische Frist-Regel für diesen Monat.
          „auf automatisch“ entfernt die manuelle Festlegung wieder.
        </p>
      </Karte>
    </>
  );
}

// ============================================================
//  TAB: Kontakt (Kontaktdaten des Administrators)
// ============================================================

function KontaktTab() {
  const [form, setForm] = useState({ kontaktName: "", kontaktEmail: "", kontaktTelefon: "", kontaktHinweis: "" });
  const [fehler, setFehler] = useState("");
  const [hinweis, setHinweis] = useState("");

  useEffect(() => {
    api
      .get<{ kontaktName?: string; kontaktEmail?: string; kontaktTelefon?: string; kontaktHinweis?: string }>("/admin/allgemein")
      .then((k) =>
        setForm({
          kontaktName: k.kontaktName ?? "",
          kontaktEmail: k.kontaktEmail ?? "",
          kontaktTelefon: k.kontaktTelefon ?? "",
          kontaktHinweis: k.kontaktHinweis ?? "",
        })
      )
      .catch(() => {});
  }, []);

  async function speichern() {
    setFehler(""); setHinweis("");
    try {
      await api.put("/admin/allgemein", form);
      setHinweis("Kontaktdaten gespeichert.");
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  return (
    <Karte titel="Kontaktdaten (für alle Nutzer sichtbar)">
      <Fehlerzeile text={fehler} />
      {hinweis && <div className="mb-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2">{hinweis}</div>}
      <div className="space-y-3 max-w-lg">
        <div>
          <label className="block text-sm font-medium mb-1">Name / Funktion</label>
          <input className="w-full border rounded px-3 py-2" value={form.kontaktName}
            onChange={(e) => setForm({ ...form, kontaktName: e.target.value })}
            placeholder="z. B. Max Mustermann (Administration)" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">E-Mail</label>
          <input type="email" className="w-full border rounded px-3 py-2" value={form.kontaktEmail}
            onChange={(e) => setForm({ ...form, kontaktEmail: e.target.value })}
            placeholder="name@oehtb.at" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Telefon</label>
          <input className="w-full border rounded px-3 py-2" value={form.kontaktTelefon}
            onChange={(e) => setForm({ ...form, kontaktTelefon: e.target.value })}
            placeholder="z. B. +43 1 234 56 78" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Hinweis (optional)</label>
          <textarea className="w-full border rounded px-3 py-2" rows={3} value={form.kontaktHinweis}
            onChange={(e) => setForm({ ...form, kontaktHinweis: e.target.value })}
            placeholder="z. B. Erreichbarkeit, Zuständigkeit…" />
        </div>
        <button onClick={speichern} className="bg-marke-700 text-white rounded px-5 py-2 font-medium hover:bg-marke-800">Speichern</button>
      </div>
      <p className="text-xs text-slate-500 mt-3">
        Diese Angaben sehen alle angemeldeten Nutzer im Menüpunkt „Kontakt“.
      </p>
    </Karte>
  );
}

// ============================================================
//  Hauptkomponente mit Tab-Navigation
// ============================================================

const GRUPPEN = [
  {
    id: "stammdaten", label: "Stammdaten", unter: [
      { id: "kostenstellen", label: "Kostenstellen" },
      { id: "bereiche", label: "Bereiche" },
      { id: "arten", label: "Kassenarten" },
      { id: "konten", label: "Kontenplan" },
      { id: "steuer", label: "Steuersätze" },
    ],
  },
  {
    id: "benutzer", label: "Kassen-Zugriff", unter: [
      { id: "benutzer", label: "Kassen-Zugriff" },
    ],
  },
  {
    id: "einstellungen", label: "Einstellungen", unter: [
      { id: "belege", label: "Belege" },
      { id: "kassensperre", label: "Kassensperre" },
      { id: "kontakt", label: "Kontakt" },
    ],
  },
  {
    id: "system", label: "System", unter: [
      { id: "backup", label: "Datensicherung" },
      { id: "audit", label: "Audit-Log" },
    ],
  },
] as const;

type GruppeId = (typeof GRUPPEN)[number]["id"];
type UnterId =
  | "kostenstellen" | "bereiche" | "arten" | "konten" | "steuer"
  | "benutzer"
  | "belege" | "kassensperre" | "kontakt"
  | "backup" | "audit";

export default function AdminSeite() {
  const [gruppeId, setGruppeId] = useState<GruppeId>("stammdaten");
  const [unter, setUnter] = useState<UnterId>("kostenstellen");
  const gruppe = GRUPPEN.find((g) => g.id === gruppeId)!;

  function gruppeWaehlen(id: GruppeId) {
    const g = GRUPPEN.find((x) => x.id === id)!;
    setGruppeId(id);
    setUnter(g.unter[0].id as UnterId);
  }

  return (
    <div>
      {/* Reihe 1: Oberkategorien */}
      <div className="flex flex-wrap gap-1 border-b">
        {GRUPPEN.map((g) => (
          <button
            key={g.id}
            onClick={() => gruppeWaehlen(g.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
              gruppeId === g.id ? "border-marke-700 text-marke-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Reihe 2: Unterreiter der aktiven Oberkategorie */}
      {gruppe.unter.length > 1 ? (
        <div className="flex flex-wrap gap-1 mt-3 mb-6">
          {gruppe.unter.map((u) => (
            <button
              key={u.id}
              onClick={() => setUnter(u.id as UnterId)}
              className={`px-3 py-1.5 text-sm rounded ${
                unter === u.id ? "bg-marke-700 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-6" />
      )}

      {unter === "benutzer" && <BenutzerTab />}
      {unter === "kostenstellen" && <KostenstellenTab />}
      {unter === "bereiche" && <StammwertTab basis="/admin/bereiche" titelEinzahl="Bereich" titelMehrzahl="Bereiche" />}
      {unter === "arten" && <StammwertTab basis="/admin/kassenarten" titelEinzahl="Kassenart" titelMehrzahl="Kassenarten" />}
      {unter === "steuer" && <SteuersaetzeTab />}
      {unter === "konten" && <KontenTab />}
      {unter === "audit" && <AuditTab />}
      {unter === "backup" && <BackupTab />}
      {unter === "belege" && <BelegeTab />}
      {unter === "kassensperre" && <KassensperreTab />}
      {unter === "kontakt" && <KontaktTab />}
    </div>
  );
}
