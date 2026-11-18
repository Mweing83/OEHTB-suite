import { useState } from "react";
import BenutzerTab from "./admin/BenutzerTab.js";
import FirmenTab from "./admin/FirmenTab.js";
import KostenstellenTab from "./admin/KostenstellenTab.js";
import SteuersaetzeTab from "./admin/SteuersaetzeTab.js";
import KontenTab from "./admin/KontenTab.js";
import StammwertTab from "./admin/StammwertTab.js";
import AuditTab from "./admin/AuditTab.js";
import BackupTab from "./admin/BackupTab.js";
import BelegeTab from "./admin/BelegeTab.js";
import KassensperreTab from "./admin/KassensperreTab.js";
import KontaktTab from "./admin/KontaktTab.js";

// Verwaltung: Reiter-Navigation; je Reiter eine Datei unter pages/admin/.

const GRUPPEN = [
  {
    id: "stammdaten", label: "Stammdaten", unter: [
      { id: "kostenstellen", label: "Kostenstellen" },
      { id: "firmen", label: "Firmen" },
      { id: "bereiche", label: "Bereiche" },
      { id: "arten", label: "Kassenarten" },
      { id: "konten", label: "Kontenplan" },
      { id: "steuer", label: "Steuersätze" },
    ],
  },
  {
    id: "benutzer", label: "Kassen-Zugriff", unter: [
      { id: "benutzer", label: "Kassen-Zugriff" },
    ],
  },
  {
    id: "einstellungen", label: "Einstellungen", unter: [
      { id: "belege", label: "Belege" },
      { id: "kassensperre", label: "Kassensperre" },
      { id: "kontakt", label: "Kontakt" },
    ],
  },
  {
    id: "system", label: "System", unter: [
      { id: "backup", label: "Datensicherung" },
      { id: "audit", label: "Audit-Log" },
    ],
  },
] as const;

type GruppeId = (typeof GRUPPEN)[number]["id"];
type UnterId =
  | "kostenstellen" | "firmen" | "bereiche" | "arten" | "konten" | "steuer"
  | "benutzer"
  | "belege" | "kassensperre" | "kontakt"
  | "backup" | "audit";

export default function AdminSeite() {
  const [gruppeId, setGruppeId] = useState<GruppeId>("stammdaten");
  const [unter, setUnter] = useState<UnterId>("kostenstellen");
  const gruppe = GRUPPEN.find((g) => g.id === gruppeId)!;

  function gruppeWaehlen(id: GruppeId) {
    const g = GRUPPEN.find((x) => x.id === id)!;
    setGruppeId(id);
    setUnter(g.unter[0].id as UnterId);
  }

  return (
    <div>
      {/* Reihe 1: Oberkategorien */}
      <div className="flex flex-wrap gap-1 border-b">
        {GRUPPEN.map((g) => (
          <button
            key={g.id}
            onClick={() => gruppeWaehlen(g.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
              gruppeId === g.id ? "border-marke-700 text-marke-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Reihe 2: Unterreiter der aktiven Oberkategorie */}
      {gruppe.unter.length > 1 ? (
        <div className="flex flex-wrap gap-1 mt-3 mb-6">
          {gruppe.unter.map((u) => (
            <button
              key={u.id}
              onClick={() => setUnter(u.id as UnterId)}
              className={`px-3 py-1.5 text-sm rounded ${
                unter === u.id ? "bg-marke-700 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-6" />
      )}

      {unter === "benutzer" && <BenutzerTab />}
      {unter === "kostenstellen" && <KostenstellenTab />}
      {unter === "firmen" && <FirmenTab />}
      {unter === "bereiche" && <StammwertTab basis="/admin/bereiche" titelNeu="Neuen Bereich anlegen" titelMehrzahl="Bereiche" />}
      {unter === "arten" && <StammwertTab basis="/admin/kassenarten" titelNeu="Neue Kassenart anlegen" titelMehrzahl="Kassenarten" />}
      {unter === "steuer" && <SteuersaetzeTab />}
      {unter === "konten" && <KontenTab />}
      {unter === "audit" && <AuditTab />}
      {unter === "backup" && <BackupTab />}
      {unter === "belege" && <BelegeTab />}
      {unter === "kassensperre" && <KassensperreTab />}
      {unter === "kontakt" && <KontaktTab />}
    </div>
  );
}
