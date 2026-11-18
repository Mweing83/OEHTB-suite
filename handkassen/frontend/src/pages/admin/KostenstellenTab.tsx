import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { formatCent, euroStringZuCent, centZuEingabe } from "../../lib/geld.js";
import { Karte, Fehlerzeile, StatusKnopf, BearbeitenKnopf, SpeichernAbbrechen, zelleInput, useFirmen, type Kostenstelle, type Stammwert } from "./gemeinsam.js";

// Reiter Kostenstellen.

export default function KostenstellenTab() {
  const [liste, setListe] = useState<Kostenstelle[]>([]);
  const [bereiche, setBereiche] = useState<Stammwert[]>([]);
  const [kassenarten, setKassenarten] = useState<Stammwert[]>([]);
  const firmen = useFirmen();
  const aktiveFirmen = firmen.filter((f) => f.aktiv);
  const [fehler, setFehler] = useState("");
  const [neu, setNeu] = useState({ firmaId: 0, nummer: "", bezeichnung: "", gegenkonto: "", bereichId: 0, kassenartId: 0, anfangssaldo: "", belegStartnummer: "", belegStartJahr: String(new Date().getFullYear()) });
  // Inline-Bearbeitung
  const [bearbeiteId, setBearbeiteId] = useState<number | null>(null);
  const [entwurf, setEntwurf] = useState({ firmaId: 0, nummer: "", bezeichnung: "", gegenkonto: "", bereichId: 0, kassenartId: 0, anfangssaldo: "", belegStartnummer: "", belegStartJahr: "" });

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
    if (!neu.firmaId) { setFehler("Bitte eine Firma wählen."); return; }
    try {
      await api.post("/admin/kostenstellen", {
        firmaId: neu.firmaId,
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
      setNeu({ firmaId: neu.firmaId, nummer: "", bezeichnung: "", gegenkonto: "", bereichId: 0, kassenartId: 0, anfangssaldo: "", belegStartnummer: "", belegStartJahr: String(new Date().getFullYear()) });
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
      firmaId: k.firmaId,
      nummer: k.nummer,
      bezeichnung: k.bezeichnung,
      gegenkonto: k.gegenkonto ?? "",
      bereichId: k.bereichId,
      kassenartId: k.kassenartId,
      anfangssaldo: centZuEingabe(k.anfangssaldoCent),
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
        firmaId: entwurf.firmaId,
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
            <input className="w-full border rounded-sm px-3 py-2" placeholder="z. B. 1260" value={neu.nummer}
              onChange={(e) => setNeu({ ...neu, nummer: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Gegenkonto (BMD)</label>
            <input className="w-full border rounded-sm px-3 py-2" placeholder="z. B. 99957" value={neu.gegenkonto}
              onChange={(e) => setNeu({ ...neu, gegenkonto: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Bezeichnung</label>
            <input className="w-full border rounded-sm px-3 py-2" value={neu.bezeichnung}
              onChange={(e) => setNeu({ ...neu, bezeichnung: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bereich</label>
            <select className="w-full border rounded-sm px-3 py-2" value={neu.bereichId}
              onChange={(e) => setNeu({ ...neu, bereichId: Number(e.target.value) })}>
              <option value={0}>wählen…</option>
              {aktiveBereiche.map((b) => <option key={b.id} value={b.id}>{b.bezeichnung}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Art</label>
            <select className="w-full border rounded-sm px-3 py-2" value={neu.kassenartId}
              onChange={(e) => setNeu({ ...neu, kassenartId: Number(e.target.value) })}>
              <option value={0}>wählen…</option>
              {aktiveArten.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Anfangssaldo €</label>
            <input className="w-full border rounded-sm px-3 py-2 text-right" placeholder="0,00" value={neu.anfangssaldo}
              onChange={(e) => setNeu({ ...neu, anfangssaldo: e.target.value })} />
          </div>
          <button onClick={anlegen} className="bg-marke-700 text-white rounded-sm py-2 font-medium hover:bg-marke-800">Anlegen</button>
        </div>
        <div className="grid grid-cols-8 gap-3 items-end mt-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Start-Belegnummer (optional)</label>
            <input className="w-full border rounded-sm px-3 py-2 text-right" placeholder="z. B. 48" value={neu.belegStartnummer}
              onChange={(e) => setNeu({ ...neu, belegStartnummer: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">gilt für Jahr</label>
            <input className="w-full border rounded-sm px-3 py-2 text-right" value={neu.belegStartJahr}
              onChange={(e) => setNeu({ ...neu, belegStartJahr: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Firma</label>
            <select className="w-full border rounded-sm px-3 py-2" value={neu.firmaId}
              onChange={(e) => setNeu({ ...neu, firmaId: Number(e.target.value) })}>
              <option value={0}>wählen…</option>
              {aktiveFirmen.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <p className="col-span-3 text-xs text-slate-500 self-center">
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
              <th className="py-2">Nummer</th><th>Bezeichnung</th><th>Firma</th><th>Gegenkonto</th><th>Bereich</th><th>Art</th>
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
                    <select className={zelleInput} value={entwurf.firmaId}
                      onChange={(e) => setEntwurf({ ...entwurf, firmaId: Number(e.target.value) })}>
                      {firmen.filter((f) => f.aktiv || f.id === entwurf.firmaId).map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  ) : k.firma.name}
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
          Die Firma lässt sich ändern, bis der erste Monat dieser Kostenstelle freigegeben ist.
        </p>
      </Karte>
    </>
  );
}
