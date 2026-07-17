import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { ScanLauf, SCAN_ART_LABEL } from "../lib/typen";

// Scan-Verlauf + manueller Start, getrennt nach Ueberwachung (bekannte
// Quellen auf neue Ausschreibungen pruefen) und Entdeckung (neue Quellen
// suchen). Ein fehlgeschlagener letzter Lauf wird als Warnbanner angezeigt.
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

  async function starten(art: "UEBERWACHUNG" | "ENTDECKUNG") {
    setFehler(null);
    try {
      await api.post("/api/scans", { art });
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  const letzter = laeufe[0];
  const zeit = (iso: string) =>
    new Date(iso).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" });

  function statistikText(l: ScanLauf): string {
    const s = l.statistik;
    if (!s) return "–";
    const u = s.ueberwachung ?? {};
    const e = s.entdeckung ?? {};
    const teile: string[] = [];
    if (l.art !== "ENTDECKUNG") {
      teile.push(`Überwachung: ${u.neu ?? 0} neu, ${u.aktualisierungen ?? 0} Aktualisierungen`);
    }
    if (l.art !== "UEBERWACHUNG") {
      teile.push(`Entdeckung: ${e.neu ?? 0} neue Quellen`);
    }
    return teile.join(" · ") || "–";
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Scans</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={() => starten("UEBERWACHUNG")}
            disabled={laeuft}
            className="rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
          >
            {laeuft ? "Scan läuft …" : "Überwachung starten"}
          </button>
          <button
            onClick={() => starten("ENTDECKUNG")}
            disabled={laeuft}
            className="rounded-md border border-marke-600 text-marke-700 px-4 py-2 text-sm font-medium hover:bg-marke-50 disabled:opacity-50"
          >
            Entdeckung starten
          </button>
        </div>
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
                <th className="px-4 py-2 font-medium">Art</th>
                <th className="px-4 py-2 font-medium">Auslöser</th>
                <th className="px-4 py-2 font-medium">Ergebnis</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {laeufe.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">{zeit(l.gestartet)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{SCAN_ART_LABEL[l.art]}</td>
                  <td className="px-4 py-2">{l.ausloeser === "ZEITPLAN" ? "Zeitplan" : "Manuell"}</td>
                  <td className="px-4 py-2">{statistikText(l)}</td>
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
