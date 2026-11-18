import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Karte, Fehlerzeile, type Kostenstelle } from "./gemeinsam.js";

// Reiter Kassensperre (Sperrfrist und Monatssperren je Kostenstelle).

interface AllgemeinKonfig { id: number; sperrFristTage: number; belegPflicht: boolean; fotoMaxKantePx: number; fotoQualitaet: number; }
interface MonatStatus { monat: number; gesperrt: boolean; manuell: boolean; autoGesperrt: boolean; }
interface SperrenAntwort { kostenstelleId: number; jahr: number; sperrFristTage: number; monate: MonatStatus[]; }

const MONATSNAMEN = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export default function KassensperreTab() {
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
        {hinweis && <div className="mb-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-sm px-3 py-2">{hinweis}</div>}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Frist nach Monatsende (Tage)</label>
            <input type="number" min={0} max={366} className="w-40 border rounded-sm px-3 py-2 text-right"
              value={frist} onChange={(e) => setFrist(e.target.value)} />
          </div>
          <button onClick={fristSpeichern} className="bg-marke-700 text-white rounded-sm px-5 py-2 font-medium hover:bg-marke-800">Speichern</button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Jede Kasse wird automatisch gesperrt, sobald nach dem Monatsende so viele Tage vergangen sind.
          Danach kann in diesem Monat nur noch ein Administrator buchen, stornieren oder bearbeiten.
          Mit „0“ wird sofort mit dem Monatsende gesperrt.
        </p>
      </Karte>

      <Karte titel="Monate manuell sperren / entsperren">
        <Fehlerzeile text={sperrenFehler} />
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <div className="min-w-[240px]">
            <label className="block text-sm font-medium mb-1">Kasse</label>
            <select className="w-full border rounded-sm px-3 py-2" value={ksId}
              onChange={(e) => setKsId(Number(e.target.value))}>
              {kostenstellen.map((k) => (
                <option key={k.id} value={k.id}>{k.nummer} – {k.bezeichnung}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Jahr</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setJahr(jahr - 1)} className="px-3 py-2 border rounded-sm text-sm hover:bg-slate-50">‹</button>
              <span className="font-medium w-14 text-center">{jahr}</span>
              <button onClick={() => setJahr(jahr + 1)} className="px-3 py-2 border rounded-sm text-sm hover:bg-slate-50">›</button>
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
