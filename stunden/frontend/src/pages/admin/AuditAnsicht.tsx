import { useState } from "react";
import { api } from "../../lib/api";

// Abschnitt: AuditLog-Ansicht (DSGVO-Nachweis)
interface AuditRow {
  id: string;
  zeitpunkt: string;
  aktion: string;
  benutzer: string | null;
  betroffenerMitarbeiter: string | null;
  details: unknown;
}

export default function AuditAnsicht() {
  const [eintraege, setEintraege] = useState<AuditRow[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [geladen, setGeladen] = useState(false);

  function laden() {
    setLaedt(true);
    api
      .get<AuditRow[]>("/api/admin/audit")
      .then(setEintraege)
      .finally(() => {
        setLaedt(false);
        setGeladen(true);
      });
  }

  // Datum/Zeit im europaeischen Layout: DD/MM/YYYY, HH:MM.
  function zeitDe(iso: string): string {
    const d = new Date(iso);
    const tag = String(d.getDate()).padStart(2, "0");
    const monat = String(d.getMonth() + 1).padStart(2, "0");
    const stunde = String(d.getHours()).padStart(2, "0");
    const minute = String(d.getMinutes()).padStart(2, "0");
    return `${tag}/${monat}/${d.getFullYear()}, ${stunde}:${minute}`;
  }

  return (
    <div className="bg-white rounded-lg shadow-xs p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800">Protokoll (Audit-Log)</h3>
          <p className="text-xs text-gray-500">
            Nachweis aller relevanten Zugriffe und Änderungen (DSGVO).
          </p>
        </div>
        <button
          onClick={laden}
          className="bg-marke-600 text-white rounded-sm px-4 py-1.5 text-sm font-medium hover:bg-marke-700"
        >
          {geladen ? "Aktualisieren" : "Protokoll laden"}
        </button>
      </div>

      {laedt && <p className="text-gray-500 text-sm">Lädt …</p>}

      {geladen && !laedt && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="py-2 font-medium">Zeitpunkt</th>
                <th className="py-2 font-medium">Aktion</th>
                <th className="py-2 font-medium">Benutzer</th>
                <th className="py-2 font-medium">Betrifft</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {eintraege.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 text-gray-600 whitespace-nowrap">
                    {zeitDe(e.zeitpunkt)}
                  </td>
                  <td className="py-2">
                    <span className="text-xs bg-gray-100 rounded-sm px-2 py-0.5">
                      {e.aktion}
                    </span>
                  </td>
                  <td className="py-2 text-gray-600">{e.benutzer ?? "–"}</td>
                  <td className="py-2 text-gray-600">
                    {e.betroffenerMitarbeiter ?? "–"}
                  </td>
                </tr>
              ))}
              {eintraege.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">
                    Keine Einträge.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
