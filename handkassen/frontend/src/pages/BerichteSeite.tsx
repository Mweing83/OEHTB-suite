import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import Berichte from "../components/Berichte.js";
import KostenstellenOptionen from "../components/KostenstellenOptionen.js";

interface Kostenstelle {
  id: number;
  nummer: string;
  bezeichnung: string;
  bereich: { id: number; bezeichnung: string };
  firma?: { id: number; name: string };
}

// Eigene Seite für die PDF-Berichte.
// Das Kostenstellen-Dropdown zeigt nur Kassen, auf die der angemeldete
// Nutzer Zugriff hat – die API /kostenstellen filtert das bereits serverseitig
// (Erfasser: nur zugewiesene; Admin/Finanzen: alle).
export default function BerichteSeite() {
  const [kostenstellen, setKostenstellen] = useState<Kostenstelle[]>([]);
  const [aktiv, setAktiv] = useState<number | null>(null);

  useEffect(() => {
    api.get<Kostenstelle[]>("/kostenstellen").then((ks) => {
      setKostenstellen(ks);
      if (ks.length) setAktiv(ks[0].id);
    }).catch(() => setKostenstellen([]));
  }, []);

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

      {aktiv && <Berichte kostenstelleId={aktiv} />}
    </div>
  );
}
