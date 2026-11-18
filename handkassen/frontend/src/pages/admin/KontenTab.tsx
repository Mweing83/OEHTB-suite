import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { formatProzent } from "../../lib/geld.js";
import { Karte, Fehlerzeile, StatusKnopf, BearbeitenKnopf, SpeichernAbbrechen, zelleInput, useFirmen, type Stammwert } from "./gemeinsam.js";

// Reiter Kontenplan.

interface Konto { id: number; firmaId: number; nummer: string; bezeichnung: string; beschreibung?: string; aktiv: boolean; bereichIds: number[]; fixSteuersatz: number | null; }

// Fixer Steuersatz im Formular: "" = frei wählbar, sonst der Prozentwert als Text.
function fixAusText(t: string): number | null {
  return t === "" ? null : Number(t);
}

export default function KontenTab() {
  const [liste, setListe] = useState<Konto[]>([]);
  const [bereiche, setBereiche] = useState<Stammwert[]>([]);
  const [fehler, setFehler] = useState("");
  const [steuersaetze, setSteuersaetze] = useState<{ id: number; prozent: number; aktiv: boolean }[]>([]);
  // Kontenplan je Firma: Auswahl oben steuert Liste und Neuanlage.
  const firmen = useFirmen();
  const [firmaId, setFirmaId] = useState(0);
  useEffect(() => {
    if (!firmaId && firmen.length) setFirmaId(firmen[0].id);
  }, [firmen, firmaId]);
  const [neu, setNeu] = useState<{ nummer: string; bezeichnung: string; beschreibung: string; bereichIds: number[]; fix: string }>({ nummer: "", bezeichnung: "", beschreibung: "", bereichIds: [], fix: "" });
  // Inline-Bearbeitung
  const [bearbeiteId, setBearbeiteId] = useState<number | null>(null);
  const [entwurf, setEntwurf] = useState<{ firmaId: number; bezeichnung: string; beschreibung: string; bereichIds: number[]; fix: string }>({ firmaId: 0, bezeichnung: "", beschreibung: "", bereichIds: [], fix: "" });

  function laden() {
    if (firmaId) api.get<Konto[]>(`/admin/konten?firma=${firmaId}`).then(setListe).catch(() => {});
    api.get<Stammwert[]>("/admin/bereiche").then(setBereiche).catch(() => {});
    api.get<{ id: number; prozent: number | string; aktiv: boolean }[]>("/admin/steuersaetze")
      .then((l) => setSteuersaetze(l.map((x) => ({ ...x, prozent: Number(x.prozent) }))))
      .catch(() => {});
  }
  useEffect(laden, [firmaId]);

  async function anlegen() {
    setFehler("");
    try {
      const { fix, ...daten } = neu;
      await api.post("/admin/konten", { ...daten, firmaId, fixSteuersatz: fixAusText(fix) });
      setNeu({ nummer: "", bezeichnung: "", beschreibung: "", bereichIds: [], fix: "" });
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
    setEntwurf({ firmaId: k.firmaId, bezeichnung: k.bezeichnung, beschreibung: k.beschreibung ?? "", bereichIds: k.bereichIds, fix: k.fixSteuersatz == null ? "" : String(k.fixSteuersatz) });
  }
  async function bearbeitenSpeichern(id: number) {
    setFehler("");
    try {
      await api.put(`/admin/konten/${id}`, {
        bezeichnung: entwurf.bezeichnung,
        beschreibung: entwurf.beschreibung,
        bereichIds: entwurf.bereichIds,
        fixSteuersatz: fixAusText(entwurf.fix),
        firmaId: entwurf.firmaId,
      });
      setBearbeiteId(null);
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  const aktiveBereiche = bereiche.filter((b) => b.aktiv);
  // Auswahl fixer Steuersatz: aktive Sätze plus ein evtl. bereits gesetzter inaktiver.
  function fixAuswahl(wert: string, onChange: (w: string) => void, klasse: string) {
    const saetze = steuersaetze.filter((s) => s.aktiv || String(s.prozent) === wert);
    return (
      <select className={klasse} value={wert} onChange={(e) => onChange(e.target.value)}>
        <option value="">frei wählbar</option>
        {saetze.map((s) => (
          <option key={s.id} value={String(s.prozent)}>fix {formatProzent(s.prozent)} %</option>
        ))}
      </select>
    );
  }
  function toggle(ids: number[], id: number): number[] {
    return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm font-medium">Firma:</label>
        <select className="border rounded-sm px-3 py-2" value={firmaId}
          onChange={(e) => { setFirmaId(Number(e.target.value)); setBearbeiteId(null); }}>
          {firmen.map((f) => <option key={f.id} value={f.id}>{f.name}{f.aktiv ? "" : " (inaktiv)"}</option>)}
        </select>
        <span className="text-xs text-slate-500">Jede Firma hat einen eigenen Kontenplan.</span>
      </div>
      <Karte titel="Neues Konto anlegen">
        <Fehlerzeile text={fehler} />
        <div className="grid grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Nummer</label>
            <input className="w-full border rounded-sm px-3 py-2" value={neu.nummer}
              onChange={(e) => setNeu({ ...neu, nummer: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Bezeichnung</label>
            <input className="w-full border rounded-sm px-3 py-2" value={neu.bezeichnung}
              onChange={(e) => setNeu({ ...neu, bezeichnung: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Beschreibung</label>
            <input className="w-full border rounded-sm px-3 py-2" value={neu.beschreibung}
              onChange={(e) => setNeu({ ...neu, beschreibung: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Steuersatz</label>
            {fixAuswahl(neu.fix, (fix) => setNeu({ ...neu, fix }), "w-full border rounded-sm px-3 py-2")}
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
          <button onClick={anlegen} className="bg-marke-700 text-white rounded-sm py-2 font-medium hover:bg-marke-800">Anlegen</button>
        </div>
      </Karte>

      <Karte titel="Kontenplan">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Nummer</th><th>Bezeichnung</th><th>Beschreibung</th><th>Steuersatz</th><th>Bereiche</th><th>Status</th><th></th>
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
                    <>
                      <input className={zelleInput} value={entwurf.bezeichnung}
                        onChange={(e) => setEntwurf({ ...entwurf, bezeichnung: e.target.value })} />
                      {/* Konto in eine andere Firma umhängen (bis zur ersten Monatsfreigabe) */}
                      <select className={`${zelleInput} mt-1`} value={entwurf.firmaId} title="Firma"
                        onChange={(e) => setEntwurf({ ...entwurf, firmaId: Number(e.target.value) })}>
                        {firmen.filter((f) => f.aktiv || f.id === entwurf.firmaId).map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </>
                  ) : k.bezeichnung}
                </td>
                <td className="text-slate-500">
                  {imEdit ? (
                    <input className={zelleInput} value={entwurf.beschreibung}
                      onChange={(e) => setEntwurf({ ...entwurf, beschreibung: e.target.value })} />
                  ) : (k.beschreibung || "–")}
                </td>
                <td className="text-slate-500 whitespace-nowrap">
                  {imEdit
                    ? fixAuswahl(entwurf.fix, (fix) => setEntwurf({ ...entwurf, fix }), zelleInput)
                    : k.fixSteuersatz == null ? "frei" : `fix ${formatProzent(k.fixSteuersatz)} %`}
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
