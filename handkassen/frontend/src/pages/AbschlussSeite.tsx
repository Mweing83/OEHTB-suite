import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { formatCent, euroStringZuCent } from "../lib/geld.js";
import { useAuth } from "../lib/auth.js";
import { hinweis } from "../components/dialog.js";
import FreieNummernHinweis from "../components/FreieNummernHinweis.js";
import KostenstellenOptionen from "../components/KostenstellenOptionen.js";
import PeriodenWahl from "../components/PeriodenWahl.js";
import { useFreieNummern, useKostenstellen } from "../lib/daten.js";

interface Abschluss {
  id: number;
  jahr: number;
  monat: number;
  zaehllisteCent: number;
  status: "offen" | "eingereicht" | "geprueft" | "freigegeben";
  kostenstelle: { id: number; nummer: string; bezeichnung: string };
}

const statusFarbe: Record<string, string> = {
  offen: "bg-slate-100 text-slate-700",
  eingereicht: "bg-amber-100 text-amber-800",
  geprueft: "bg-marke-100 text-marke-800",
  freigegeben: "bg-green-100 text-green-800",
};

export default function AbschlussSeite() {
  const { benutzer } = useAuth();
  const { kostenstellen } = useKostenstellen();
  const [abschluesse, setAbschluesse] = useState<Abschluss[]>([]);
  const heute = new Date();
  const [ksId, setKsId] = useState<number | null>(null);
  const [jahr, setJahr] = useState(heute.getFullYear());
  const [monat, setMonat] = useState(heute.getMonth() + 1);
  const [zaehlliste, setZaehlliste] = useState("");
  const [meldung, setMeldung] = useState("");

  function laden() {
    api.get<Abschluss[]>("/abschluss").then(setAbschluesse).catch(() => {});
  }
  useEffect(laden, []);
  // Erste Kostenstelle vorwählen, falls noch nichts gewählt ist.
  useEffect(() => {
    if (kostenstellen.length) setKsId((alt) => alt ?? kostenstellen[0].id);
  }, [kostenstellen]);

  // Lücke in der Belegnummerierung vor dem Abschluss anzeigen (nur Hinweis).
  const freieNummern = useFreieNummern(
    ksId ? `/buchungen/freie-belegnummern?kostenstelle=${ksId}&jahr=${jahr}&monat=${monat}` : null
  );

  async function einreichen() {
    setMeldung("");
    if (!ksId) {
      setMeldung("Bitte eine Kostenstelle auswählen.");
      return;
    }
    const zaehlCent = euroStringZuCent(zaehlliste);
    if (Number.isNaN(zaehlCent)) {
      setMeldung("Bitte den gezählten Kassenstand eingeben (z. B. 0,00).");
      return;
    }
    try {
      const r = await api.post<{ differenzCent: number; sollCent: number }>("/abschluss/einreichen", {
        kostenstelleId: ksId,
        jahr,
        monat,
        zaehllisteCent: zaehlCent,
      });
      const diff = r.differenzCent;
      setMeldung(
        diff === 0
          ? `Abschluss eingereicht. Soll/Ist stimmt überein (${formatCent(r.sollCent)}).`
          : `Abschluss eingereicht. ACHTUNG Differenz: ${formatCent(diff)} (Soll ${formatCent(r.sollCent)}).`
      );
      laden();
    } catch (e) {
      setMeldung((e as Error).message);
    }
  }

  async function aktion(id: number, was: "pruefen" | "freigeben") {
    await api
      .post(`/abschluss/${id}/${was}`)
      .catch((e) => hinweis((e as Error).message));
    laden();
  }

  const istLeitung = benutzer?.rolle === "leitung" || benutzer?.rolle === "finanzen" || benutzer?.rolle === "admin";
  const istFinanzen = benutzer?.rolle === "finanzen" || benutzer?.rolle === "admin";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg shadow-sm p-5">
        <h2 className="font-semibold text-marke-900 mb-4">Monatsabschluss einreichen</h2>
        {meldung && (
          <div className="mb-4 text-sm bg-marke-50 border border-marke-200 rounded-sm px-3 py-2">{meldung}</div>
        )}
        <label className="block text-sm font-medium mb-1">Kostenstelle</label>
        <select className="w-full border rounded-sm px-3 py-2 mb-4" value={ksId ?? ""} onChange={(e) => setKsId(Number(e.target.value))}>
          <KostenstellenOptionen liste={kostenstellen} />
        </select>
        <label htmlFor="abschluss-periode" className="block text-sm font-medium mb-1">Monat</label>
        <PeriodenWahl
          id="abschluss-periode"
          className="mb-4"
          jahr={jahr}
          monat={monat}
          onChange={(j, m) => { setJahr(j); setMonat(m); }}
        />
        <FreieNummernHinweis
          nummern={freieNummern}
          className="mb-4"
          zusatz="Wird in diesem Monat nichts mehr gebucht, bleibt die Lücke bestehen und gelangt so in den Export."
        />
        <label className="block text-sm font-medium mb-1">Gezählter Kassenstand (Zählliste)</label>
        <input className="w-full border rounded-sm px-3 py-2 mb-4 text-right" placeholder="0,00" value={zaehlliste} onChange={(e) => setZaehlliste(e.target.value)} />
        <button onClick={einreichen} className="w-full bg-marke-700 text-white rounded-sm py-2 font-medium hover:bg-marke-800">
          Abschluss einreichen
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-5">
        <h2 className="font-semibold text-marke-900 mb-4">Abschlüsse</h2>
        {abschluesse.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Abschlüsse.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Periode</th>
                <th>Kostenstelle</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {abschluesse.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2">{a.monat}/{a.jahr}</td>
                  <td>{a.kostenstelle.bezeichnung}</td>
                  <td>
                    <span className={`text-xs px-2 py-0.5 rounded-sm ${statusFarbe[a.status]}`}>{a.status}</span>
                  </td>
                  <td className="text-right space-x-2">
                    {istLeitung && a.status === "eingereicht" && (
                      <button onClick={() => aktion(a.id, "pruefen")} className="text-xs text-marke-700 hover:underline">prüfen</button>
                    )}
                    {istFinanzen && a.status === "geprueft" && (
                      <button onClick={() => aktion(a.id, "freigeben")} className="text-xs text-green-700 hover:underline">freigeben</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
