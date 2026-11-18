import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { formatProzent } from "../../lib/geld.js";
import { bestaetigen } from "../../components/dialog.js";
import { Karte, Fehlerzeile, StatusKnopf } from "./gemeinsam.js";

// Reiter Steuersätze.

interface Steuersatz { id: number; prozent: number; bezeichnung: string; aktiv: boolean; }

export default function SteuersaetzeTab() {
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
  async function loeschen(s: Steuersatz) {
    setFehler("");
    const ok = await bestaetigen(`Steuersatz ${formatProzent(s.prozent)} % wirklich löschen?`, {
      titel: "Steuersatz löschen",
      bestaetigenText: "Löschen",
      gefahr: true,
    });
    if (!ok) return;
    try {
      await api.post(`/admin/steuersaetze/${s.id}/loeschen`);
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  return (
    <>
      <Karte titel="Neuen Steuersatz anlegen">
        <Fehlerzeile text={fehler} />
        <div className="grid grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Prozent</label>
            <input className="w-full border rounded-sm px-3 py-2 text-right" placeholder="z. B. 13 oder 4,9" value={neu.prozent}
              onChange={(e) => setNeu({ ...neu, prozent: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Bezeichnung</label>
            <input className="w-full border rounded-sm px-3 py-2" value={neu.bezeichnung}
              onChange={(e) => setNeu({ ...neu, bezeichnung: e.target.value })} />
          </div>
          <button onClick={anlegen} className="bg-marke-700 text-white rounded-sm py-2 font-medium hover:bg-marke-800">Anlegen</button>
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
                <td className="text-right space-x-2 whitespace-nowrap">
                  <StatusKnopf aktiv={s.aktiv} onClick={() => aktivSchalten(s)} />
                  <button onClick={() => loeschen(s)} className="text-xs text-red-600 hover:underline">löschen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </>
  );
}
