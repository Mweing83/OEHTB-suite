import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Karte, Fehlerzeile, StatusKnopf, BearbeitenKnopf, SpeichernAbbrechen, zelleInput, type Firma } from "./gemeinsam.js";

// Reiter Firmen (Mandanten).

export default function FirmenTab() {
  const [liste, setListe] = useState<Firma[]>([]);
  const [fehler, setFehler] = useState("");
  const [neu, setNeu] = useState("");
  const [bearbeiteId, setBearbeiteId] = useState<number | null>(null);
  const [entwurf, setEntwurf] = useState("");

  function laden() {
    api.get<Firma[]>("/admin/firmen").then(setListe).catch(() => {});
  }
  useEffect(laden, []);

  async function anlegen() {
    setFehler("");
    try {
      await api.post("/admin/firmen", { name: neu.trim() });
      setNeu("");
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  async function speichern(id: number) {
    setFehler("");
    try {
      await api.put(`/admin/firmen/${id}`, { name: entwurf.trim() });
      setBearbeiteId(null);
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  async function aktivSchalten(f: Firma) {
    await api.post(`/admin/firmen/${f.id}/aktiv`, { aktiv: !f.aktiv }).catch((e) => setFehler((e as Error).message));
    laden();
  }

  return (
    <>
      <Karte titel="Neue Firma anlegen">
        <Fehlerzeile text={fehler} />
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Name</label>
            <input className="w-full border rounded-sm px-3 py-2" value={neu} onChange={(e) => setNeu(e.target.value)} />
          </div>
          <button onClick={anlegen} className="bg-marke-700 text-white rounded-sm px-4 py-2 font-medium hover:bg-marke-800">Anlegen</button>
        </div>
      </Karte>
      <Karte titel="Firmen">
        <p className="text-sm text-slate-600 mb-3">
          Jede Firma hat einen eigenen Kontenplan und eigene Kostenstellen; Monatsabschluss,
          Kassastand und Export laufen getrennt je Firma. Benutzer:innen sehen eine Firma über
          die ihnen zugeordneten Kostenstellen, Finanzen und Admin sehen alle Firmen.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Name</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {liste.map((f) => (
              <tr key={f.id} className="border-b last:border-0">
                <td className="py-2">
                  {bearbeiteId === f.id ? (
                    <input className={zelleInput} value={entwurf} onChange={(e) => setEntwurf(e.target.value)} />
                  ) : f.name}
                </td>
                <td>{f.aktiv ? <span className="text-green-700">aktiv</span> : <span className="text-slate-500">inaktiv</span>}</td>
                <td className="text-right space-x-2 whitespace-nowrap">
                  {bearbeiteId === f.id ? (
                    <SpeichernAbbrechen onSpeichern={() => speichern(f.id)} onAbbrechen={() => setBearbeiteId(null)} />
                  ) : (
                    <>
                      <BearbeitenKnopf onClick={() => { setBearbeiteId(f.id); setEntwurf(f.name); }} />
                      <StatusKnopf aktiv={f.aktiv} onClick={() => aktivSchalten(f)} />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </>
  );
}
