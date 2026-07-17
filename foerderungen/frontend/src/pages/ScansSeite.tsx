import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { ScanLauf } from "../lib/typen";

// Scan-Verlauf + manueller Start. Ein fehlgeschlagener letzter Lauf wird als
// Warnbanner angezeigt (Spec: "Letzter Scan fehlgeschlagen am ...").
export default function ScansSeite() {
  const [laeufe, setLaeufe] = useState<ScanLauf[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  function laden() {
    api
      .get<{ laeuft: boolean; laeufe: ScanLauf[] }>("/api/scans")
      .then((d) => {
        setLaeuft(d.laeuft);
        setLaeufe(d.laeufe);
      })
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }
  useEffect(() => {
    laden();
    // Solange ein Scan laeuft, alle 5 s auffrischen.
    const t = setInterval(laden, 5000);
    return () => clearInterval(t);
  }, []);

  async function starten() {
    setFehler(null);
    try {
      await api.post("/api/scans");
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  const letzter = laeufe[0];
  const zeit = (iso: string) =>
    new Date(iso).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" });

  function statistikText(s: ScanLauf["statistik"]): string {
    if (!s) return "–";
    const u = s.ueberwachung ?? {};
    const e = s.entdeckung ?? {};
    return `Überwachung: ${u.neu ?? 0} neu, ${u.aktualisierungen ?? 0} Aktualisierungen · Entdeckung: ${e.neu ?? 0} neue Quellen`;
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Scans</h1>
        <button
          onClick={starten}
          disabled={laeuft}
          className="ml-auto rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          {laeuft ? "Scan läuft …" : "Scan jetzt starten"}
        </button>
      </div>

      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}
      {letzter?.fehler && (
        <div className="bg-warnung-50 border border-warnung-600 text-warnung-700 rounded-md px-4 py-3 text-sm mb-6">
          Letzter Scan fehlgeschlagen am {zeit(letzter.gestartet)}: {letzter.fehler}
        </div>
      )}

      {laedt ? (
        <p className="text-gray-500">Lädt …</p>
      ) : laeufe.length === 0 ? (
        <p className="text-gray-500">Noch keine Scans gelaufen.</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="px-4 py-2 font-medium">Gestartet</th>
                <th className="px-4 py-2 font-medium">Auslöser</th>
                <th className="px-4 py-2 font-medium">Ergebnis</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {laeufe.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">{zeit(l.gestartet)}</td>
                  <td className="px-4 py-2">{l.ausloeser === "ZEITPLAN" ? "Zeitplan" : "Manuell"}</td>
                  <td className="px-4 py-2">{statistikText(l.statistik)}</td>
                  <td className="px-4 py-2">
                    {!l.beendet ? (
                      <span className="text-marke-600">läuft …</span>
                    ) : l.fehler ? (
                      <span className="text-gefahr-700" title={l.fehler}>Fehler</span>
                    ) : (
                      <span className="text-erfolg-700">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
