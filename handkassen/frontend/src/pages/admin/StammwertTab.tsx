import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Karte, Fehlerzeile, StatusKnopf, BearbeitenKnopf, SpeichernAbbrechen, zelleInput, type Stammwert } from "./gemeinsam.js";

// Wiederverwendbarer Tab für einfache Stammwerte mit nur einem Feld
// (Bezeichnung). Wird für „Bereiche“ und „Arten“ verwendet.
export default function StammwertTab({
  basis, titelNeu, titelMehrzahl,
}: {
  basis: string;          // API-Basis, z. B. "/admin/bereiche"
  titelNeu: string;       // z. B. "Neuen Bereich anlegen"
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
      <Karte titel={titelNeu}>
        <Fehlerzeile text={fehler} />
        <div className="grid grid-cols-4 gap-3 items-end">
          <div className="col-span-3">
            <label className="block text-sm font-medium mb-1">Bezeichnung</label>
            <input className="w-full border rounded-sm px-3 py-2" value={neu}
              onChange={(e) => setNeu(e.target.value)} />
          </div>
          <button onClick={anlegen} className="bg-marke-700 text-white rounded-sm py-2 font-medium hover:bg-marke-800">Anlegen</button>
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
