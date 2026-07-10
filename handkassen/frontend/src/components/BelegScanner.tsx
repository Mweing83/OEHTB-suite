import { useEffect, useRef, useState } from "react";
import { ladeScanner } from "../lib/scanner.js";
import { api } from "../lib/api.js";

interface Punkt { x: number; y: number; }

interface Props {
  // Aufgenommenes/gewähltes Bild, das zugeschnitten werden soll.
  quelle: File;
  // Liefert die fertige (zugeschnittene oder im Original belassene) Datei.
  onFertig: (datei: File) => void;
  onAbbrechen: () => void;
}

const MAX_BREITE = 380; // Anzeigebreite der Vorschau in px

function abstand(a: Punkt, b: Punkt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Skaliert ein Bild/Canvas auf eine maximale Kantenlänge herunter (kein
// Hochskalieren) und gibt es als JPEG-Datei mit der gewünschten Qualität zurück.
async function skaliereZuDatei(
  quelle: HTMLImageElement | HTMLCanvasElement,
  maxKante: number,
  qualitaet: number
): Promise<File> {
  const breite = quelle instanceof HTMLImageElement ? quelle.naturalWidth : quelle.width;
  const hoehe = quelle instanceof HTMLImageElement ? quelle.naturalHeight : quelle.height;
  const faktor = Math.min(1, maxKante / Math.max(breite, hoehe));
  const zielB = Math.max(1, Math.round(breite * faktor));
  const zielH = Math.max(1, Math.round(hoehe * faktor));

  const canvas = document.createElement("canvas");
  canvas.width = zielB;
  canvas.height = zielH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar.");
  ctx.drawImage(quelle, 0, 0, zielB, zielH);

  const q = Math.min(1, Math.max(0.3, qualitaet / 100));
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob fehlgeschlagen"))), "image/jpeg", q)
  );
  return new File([blob], `beleg_${Date.now()}.jpg`, { type: "image/jpeg" });
}

// Beleg-Scanner: automatische Kantenerkennung + manuelle Eckenkorrektur +
// perspektivischer Zuschnitt. Beim Speichern wird das Foto zusätzlich auf die
// vom Administrator konfigurierte Auflösung (max. Kantenlänge + Qualität)
// heruntergerechnet. Reihenfolge der Ecken: oben-links, oben-rechts,
// unten-rechts, unten-links.
export default function BelegScanner({ quelle, onFertig, onAbbrechen }: Props) {
  const [status, setStatus] = useState<"laden" | "bereit" | "fehler" | "verarbeite">("laden");
  const [fehlertext, setFehlertext] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [ecken, setEcken] = useState<Punkt[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const [anzeige, setAnzeige] = useState({ breite: 0, hoehe: 0, faktor: 1 });

  // Vom Administrator konfigurierte Belegfoto-Auflösung (Standard 1600 px / 80 %).
  const [einstellungen, setEinstellungen] = useState({ fotoMaxKantePx: 1600, fotoQualitaet: 80 });

  const bildRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const objektUrlRef = useRef<string | null>(null);

  // Einstellungen laden (für alle Rollen lesbar). Bei Fehler bleiben die Standardwerte.
  useEffect(() => {
    api
      .get<{ fotoMaxKantePx: number; fotoQualitaet: number }>("/buchungen/einstellungen")
      .then((e) =>
        setEinstellungen({
          fotoMaxKantePx: e.fotoMaxKantePx ?? 1600,
          fotoQualitaet: e.fotoQualitaet ?? 80,
        })
      )
      .catch(() => {});
  }, []);

  // Bild laden und (wenn möglich) Ecken automatisch erkennen.
  useEffect(() => {
    let abgebrochen = false;
    const url = URL.createObjectURL(quelle);
    objektUrlRef.current = url;
    const bild = new Image();
    bildRef.current = bild;

    bild.onload = async () => {
      if (abgebrochen) return;
      const faktor = Math.min(1, MAX_BREITE / bild.naturalWidth);
      const breite = Math.round(bild.naturalWidth * faktor);
      const hoehe = Math.round(bild.naturalHeight * faktor);
      setAnzeige({ breite, hoehe, faktor });

      const standard: Punkt[] = [
        { x: breite * 0.1, y: hoehe * 0.1 },
        { x: breite * 0.9, y: hoehe * 0.1 },
        { x: breite * 0.9, y: hoehe * 0.9 },
        { x: breite * 0.1, y: hoehe * 0.9 },
      ];

      try {
        const { cv, jscanify } = await ladeScanner();
        if (abgebrochen) return;
        const scanner = new jscanify();
        let erkannt: Punkt[] | null = null;
        try {
          const src = cv.imread(bild);
          const contour = scanner.findPaperContour(src);
          if (contour) {
            const cp = scanner.getCornerPoints(contour);
            const kandidat = [cp?.topLeftCorner, cp?.topRightCorner, cp?.bottomRightCorner, cp?.bottomLeftCorner];
            if (kandidat.every((p) => p && isFinite(p.x) && isFinite(p.y))) {
              erkannt = kandidat.map((p) => ({ x: p.x * faktor, y: p.y * faktor }));
            }
          }
          src.delete();
        } catch {
          erkannt = null;
        }
        setEcken(erkannt ?? standard);
        if (!erkannt) setHinweis("Kanten nicht automatisch erkannt – bitte die Ecken von Hand setzen.");
        setStatus("bereit");
      } catch {
        setStatus("fehler");
        setFehlertext("Automatische Beleg-Erkennung ist gerade nicht verfügbar.");
      }
    };
    bild.onerror = () => {
      setStatus("fehler");
      setFehlertext("Das Bild konnte nicht geladen werden.");
    };
    bild.src = url;

    return () => {
      abgebrochen = true;
      if (objektUrlRef.current) URL.revokeObjectURL(objektUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quelle]);

  // Bild in den Anzeige-Canvas zeichnen, sobald Größe bekannt ist.
  useEffect(() => {
    const c = canvasRef.current;
    const bild = bildRef.current;
    if (!c || !bild || anzeige.breite === 0) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(bild, 0, 0, anzeige.breite, anzeige.hoehe);
  }, [anzeige, status]);

  // Ziehen der Ecken (Maus + Touch) über Fenster-Listener.
  useEffect(() => {
    if (drag === null) return;
    function bewegen(e: PointerEvent) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = Math.max(0, Math.min(anzeige.breite, e.clientX - rect.left));
      const y = Math.max(0, Math.min(anzeige.hoehe, e.clientY - rect.top));
      setEcken((alt) => alt.map((p, i) => (i === drag ? { x, y } : p)));
    }
    function loslassen() {
      setDrag(null);
    }
    window.addEventListener("pointermove", bewegen);
    window.addEventListener("pointerup", loslassen);
    return () => {
      window.removeEventListener("pointermove", bewegen);
      window.removeEventListener("pointerup", loslassen);
    };
  }, [drag, anzeige]);

  // Original (ohne Zuschnitt), aber auf die konfigurierte Auflösung skaliert.
  async function originalVerwenden() {
    try {
      const bild = bildRef.current;
      if (bild && bild.complete && bild.naturalWidth > 0) {
        const datei = await skaliereZuDatei(bild, einstellungen.fotoMaxKantePx, einstellungen.fotoQualitaet);
        onFertig(datei);
        return;
      }
    } catch {
      // Fällt auf das unveränderte Original zurück.
    }
    onFertig(quelle);
  }

  // Perspektivisch zuschneiden, auf die konfigurierte Auflösung skalieren, zurückgeben.
  async function uebernehmen() {
    if (ecken.length !== 4) return;
    setStatus("verarbeite");
    try {
      const { jscanify } = await ladeScanner();
      const scanner = new jscanify();
      const f = 1 / anzeige.faktor; // Anzeige- -> Originalkoordinaten
      const cp = {
        topLeftCorner: { x: ecken[0].x * f, y: ecken[0].y * f },
        topRightCorner: { x: ecken[1].x * f, y: ecken[1].y * f },
        bottomRightCorner: { x: ecken[2].x * f, y: ecken[2].y * f },
        bottomLeftCorner: { x: ecken[3].x * f, y: ecken[3].y * f },
      };
      const breite = Math.max(abstand(cp.topLeftCorner, cp.topRightCorner), abstand(cp.bottomLeftCorner, cp.bottomRightCorner));
      const hoehe = Math.max(abstand(cp.topLeftCorner, cp.bottomLeftCorner), abstand(cp.topRightCorner, cp.bottomRightCorner));
      const ergebnis: HTMLCanvasElement = scanner.extractPaper(
        bildRef.current,
        Math.max(1, Math.round(breite)),
        Math.max(1, Math.round(hoehe)),
        cp
      );
      const datei = await skaliereZuDatei(ergebnis, einstellungen.fotoMaxKantePx, einstellungen.fotoQualitaet);
      onFertig(datei);
    } catch {
      setFehlertext("Zuschneiden fehlgeschlagen. Bitte das Original verwenden.");
      setStatus("fehler");
    }
  }

  const polygon = ecken.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="mt-3 border rounded p-3 bg-slate-50">
      {status === "laden" && <p className="text-sm text-slate-600">Beleg-Erkennung wird geladen…</p>}

      {status === "fehler" && (
        <div>
          <p className="text-sm text-amber-700 mb-2">{fehlertext} Du kannst das Foto unverändert verwenden.</p>
          {objektUrlRef.current && (
            <img src={objektUrlRef.current} alt="Beleg" className="w-full max-w-sm rounded border mb-2" />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={originalVerwenden}
              className="bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-800">
              Original verwenden
            </button>
            <button type="button" onClick={onAbbrechen}
              className="text-sm text-slate-600 hover:underline px-2">Abbrechen</button>
          </div>
        </div>
      )}

      {(status === "bereit" || status === "verarbeite") && (
        <div>
          <p className="text-xs text-slate-500 mb-2">
            Ziehe die vier Ecken auf den Beleg. „Übernehmen" schneidet zu und rückt gerade.
          </p>
          {hinweis && <p className="text-xs text-amber-600 mb-2">{hinweis}</p>}
          <div className="relative inline-block" style={{ width: anzeige.breite, height: anzeige.hoehe, touchAction: "none" }}>
            <canvas ref={canvasRef} width={anzeige.breite} height={anzeige.hoehe} className="rounded border block" />
            <svg
              ref={svgRef}
              width={anzeige.breite}
              height={anzeige.hoehe}
              className="absolute inset-0"
              style={{ touchAction: "none" }}
            >
              <polygon points={polygon} fill="rgba(37,99,235,0.15)" stroke="#2563eb" strokeWidth={2} />
              {ecken.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={11}
                  fill="#2563eb"
                  stroke="white"
                  strokeWidth={2}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => {
                    (e.target as SVGCircleElement).setPointerCapture?.(e.pointerId);
                    setDrag(i);
                  }}
                />
              ))}
            </svg>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={uebernehmen}
              disabled={status === "verarbeite"}
              className="bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
            >
              {status === "verarbeite" ? "Wird zugeschnitten…" : "Übernehmen"}
            </button>
            <button type="button" onClick={originalVerwenden}
              className="text-sm border rounded px-3 py-2 hover:bg-white">Original behalten</button>
            <button type="button" onClick={onAbbrechen}
              className="text-sm text-slate-600 hover:underline px-2">Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}
