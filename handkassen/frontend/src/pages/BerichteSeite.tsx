import { useEffect, useState } from "react";
import Berichte from "../components/Berichte.js";
import KostenstellenOptionen from "../components/KostenstellenOptionen.js";
import { useKostenstellen } from "../lib/daten.js";

// Eigene Seite für die PDF-Berichte.
// Das Kostenstellen-Dropdown zeigt nur Kassen, auf die der angemeldete
// Nutzer Zugriff hat – die API /kostenstellen filtert das bereits serverseitig
// (Erfasser: nur zugewiesene; Admin/Finanzen: alle).
export default function BerichteSeite() {
  const { kostenstellen } = useKostenstellen();
  const [aktiv, setAktiv] = useState<number | null>(null);

  // Erste Kostenstelle vorwählen, falls noch nichts gewählt ist.
  useEffect(() => {
    if (kostenstellen.length) setAktiv((alt) => alt ?? kostenstellen[0].id);
  }, [kostenstellen]);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm font-medium">Kostenstelle:</label>
        {kostenstellen.length === 0 ? (
          <span className="text-sm text-slate-500">Keine Kostenstellen verfügbar.</span>
        ) : (
          <select
            className="border rounded-sm px-3 py-2"
            value={aktiv ?? ""}
            onChange={(e) => setAktiv(Number(e.target.value))}
          >
            <KostenstellenOptionen liste={kostenstellen} />
          </select>
        )}
      </div>

      {aktiv && <Berichte kostenstelleId={aktiv} kostenstellen={kostenstellen} />}
    </div>
  );
}
