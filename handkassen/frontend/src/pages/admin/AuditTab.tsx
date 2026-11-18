import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Karte } from "./gemeinsam.js";

// Reiter Audit-Log.

interface AuditEintrag {
  id: number;
  zeitpunkt: string;
  aktion: string;
  entitaet: string;
  entitaetId?: number;
  benutzer?: { name: string; benutzername: string };
}

export default function AuditTab() {
  const [liste, setListe] = useState<AuditEintrag[]>([]);
  useEffect(() => {
    api.get<AuditEintrag[]>("/admin/audit?limit=300").then(setListe).catch(() => {});
  }, []);

  return (
    <Karte titel="Audit-Log (letzte 300 Einträge)">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            <th className="py-2">Zeitpunkt</th><th>Benutzer</th><th>Aktion</th><th>Objekt</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((e) => (
            <tr key={e.id} className="border-b last:border-0">
              <td className="py-2 whitespace-nowrap">{new Date(e.zeitpunkt).toLocaleString("de-AT")}</td>
              <td>{e.benutzer ? e.benutzer.benutzername : "–"}</td>
              <td className="font-mono text-xs">{e.aktion}</td>
              <td className="text-slate-500">{e.entitaet}{e.entitaetId ? ` #${e.entitaetId}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Karte>
  );
}
