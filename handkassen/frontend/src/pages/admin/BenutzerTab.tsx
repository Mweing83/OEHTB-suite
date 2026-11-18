import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Karte, Fehlerzeile, type Benutzer, type Kostenstelle } from "./gemeinsam.js";

// Reiter Kassen-Zugriff: Benutzerliste mit Kostenstellen-Zuweisung.

export default function BenutzerTab() {
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
            <input className="w-full border rounded-sm px-3 py-1.5 text-sm" placeholder="Suchbegriff…"
              value={suche} onChange={(e) => setSuche(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Rolle</label>
            <select className="border rounded-sm px-3 py-1.5 text-sm" value={rolleFilter}
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
            <div className="max-h-64 overflow-auto space-y-3 mb-4">
              {/* nach Firma gruppiert: über die Kostenstellen sieht der Benutzer die Firma */}
              {Array.from(new Map(kostenstellen.filter((k) => k.aktiv).map((k) => [k.firmaId, k.firma])).values())
                .sort((a, b) => a.id - b.id)
                .map((f) => (
                  <div key={f.id}>
                    <div className="text-xs font-semibold text-slate-500 mb-1">{f.name}</div>
                    <div className="space-y-2">
                      {kostenstellen.filter((k) => k.aktiv && k.firmaId === f.id).map((k) => (
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
                          {k.nummer} {k.bezeichnung} <span className="text-slate-500">({k.bereich.bezeichnung})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setZuweisung(null)} className="px-3 py-2 text-sm text-slate-600 hover:underline">Abbrechen</button>
              <button onClick={zuweisungSpeichern} className="bg-marke-700 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-800">Speichern</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
