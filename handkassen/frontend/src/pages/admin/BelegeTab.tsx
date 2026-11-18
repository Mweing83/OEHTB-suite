import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Karte, Fehlerzeile } from "./gemeinsam.js";

// Reiter Belege (Einstellungen zu Belegpflicht und Fotos).

interface AllgemeinKonfig { id: number; sperrFristTage: number; belegPflicht: boolean; fotoMaxKantePx: number; fotoQualitaet: number; }

export default function BelegeTab() {
  const [belegPflicht, setBelegPflicht] = useState(false);
  const [bpHinweis, setBpHinweis] = useState("");
  const [fotoMaxKante, setFotoMaxKante] = useState("1600");
  const [fotoQualitaet, setFotoQualitaet] = useState("80");
  const [fotoHinweis, setFotoHinweis] = useState("");
  const [fotoFehler, setFotoFehler] = useState("");

  useEffect(() => {
    api.get<AllgemeinKonfig>("/admin/allgemein").then((k) => {
      setBelegPflicht(!!k.belegPflicht);
      setFotoMaxKante(String(k.fotoMaxKantePx ?? 1600));
      setFotoQualitaet(String(k.fotoQualitaet ?? 80));
    }).catch(() => {});
  }, []);

  async function belegPflichtUmschalten(neu: boolean) {
    setBpHinweis("");
    setBelegPflicht(neu);
    try {
      await api.put("/admin/allgemein", { belegPflicht: neu });
      setBpHinweis(neu ? "Belegpflicht aktiviert." : "Belegpflicht deaktiviert.");
    } catch (e) {
      setBelegPflicht(!neu);
      setBpHinweis("Fehler: " + (e as Error).message);
    }
  }

  async function fotoSpeichern() {
    setFotoFehler(""); setFotoHinweis("");
    const kante = parseInt(fotoMaxKante, 10);
    const q = parseInt(fotoQualitaet, 10);
    if (isNaN(kante) || kante < 400 || kante > 4000) { setFotoFehler("Maximale Kantenlänge: 400 bis 4000 px."); return; }
    if (isNaN(q) || q < 30 || q > 100) { setFotoFehler("Qualität: 30 bis 100."); return; }
    try {
      await api.put("/admin/allgemein", { fotoMaxKantePx: kante, fotoQualitaet: q });
      setFotoHinweis("Gespeichert.");
    } catch (e) {
      setFotoFehler((e as Error).message);
    }
  }

  return (
    <>
      <Karte titel="Belegpflicht">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={belegPflicht} onChange={(e) => belegPflichtUmschalten(e.target.checked)} />
          <span>Buchungen nur mit angehängtem Beleg erlauben</span>
        </label>
        {bpHinweis && <div className="mt-2 text-sm text-green-800">{bpHinweis}</div>}
        <p className="text-xs text-slate-500 mt-3">
          Ist dies aktiv, kann eine Buchung (auch beim Bearbeiten) nur mit angehängtem Beleg gespeichert
          werden. Gilt für alle Kassen und alle Rollen.
        </p>
      </Karte>

      <Karte titel="Belegfotos – Auflösung">
        <Fehlerzeile text={fotoFehler} />
        {fotoHinweis && <div className="mb-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-sm px-3 py-2">{fotoHinweis}</div>}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Max. Kantenlänge (px)</label>
            <input type="number" min={400} max={4000} step={100} className="w-40 border rounded-sm px-3 py-2 text-right"
              value={fotoMaxKante} onChange={(e) => setFotoMaxKante(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">JPEG-Qualität (30–100)</label>
            <input type="number" min={30} max={100} className="w-40 border rounded-sm px-3 py-2 text-right"
              value={fotoQualitaet} onChange={(e) => setFotoQualitaet(e.target.value)} />
          </div>
          <button onClick={fotoSpeichern} className="bg-marke-700 text-white rounded-sm px-5 py-2 font-medium hover:bg-marke-800">Speichern</button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Beim Speichern eines Belegfotos wird die längere Bildkante auf diesen Wert begrenzt
          (kein Hochskalieren) und mit der gewählten JPEG-Qualität gespeichert. Kleinere Werte
          sparen Speicherplatz, größere erhalten mehr Details. Richtwert: 1600 px / 80 %.
        </p>
      </Karte>
    </>
  );
}
