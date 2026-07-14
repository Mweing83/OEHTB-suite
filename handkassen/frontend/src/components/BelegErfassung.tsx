import { useEffect, useRef, useState } from "react";
import BelegScanner from "./BelegScanner.js";

interface Props {
  // Wird aufgerufen, sobald eine Beleg-Datei gewählt oder aufgenommen wurde
  // (oder mit null, wenn entfernt).
  onDatei: (datei: File | null) => void;
}

// Beleg erfassen: per Datei-Auswahl ODER per Kamera.
// Aufgenommene/gewählte Bilder laufen anschließend durch den Beleg-Scanner
// (Kanten erkennen, Ecken korrigieren, zuschneiden). PDFs werden direkt angehängt.
export default function BelegErfassung({ onDatei }: Props) {
  const [modus, setModus] = useState<"keine" | "livekamera" | "scannen">("keine");
  const [scanQuelle, setScanQuelle] = useState<File | null>(null);
  const [vorschauUrl, setVorschauUrl] = useState<string | null>(null);
  const [dateiname, setDateiname] = useState<string>("");
  const [hinweis, setHinweis] = useState<string>("");

  const [kameras, setKameras] = useState<MediaDeviceInfo[]>([]);
  const [kameraIndex, setKameraIndex] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);

  function streamStoppen() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }
  useEffect(() => {
    return () => {
      streamStoppen();
      if (vorschauUrl) URL.revokeObjectURL(vorschauUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setzeVorschau(datei: File) {
    if (vorschauUrl) URL.revokeObjectURL(vorschauUrl);
    const url = URL.createObjectURL(datei);
    setVorschauUrl(url);
    setDateiname(datei.name);
    onDatei(datei);
  }

  function entfernen() {
    if (vorschauUrl) URL.revokeObjectURL(vorschauUrl);
    setVorschauUrl(null);
    setDateiname("");
    onDatei(null);
  }

  // Bilder gehen in den Beleg-Scanner, PDFs werden direkt angehängt.
  function dateiRouten(f: File) {
    if (f.type.startsWith("image/")) {
      setScanQuelle(f);
      setModus("scannen");
    } else {
      setzeVorschau(f);
    }
  }

  function dateiGewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) dateiRouten(f);
  }

  async function streamStarten(deviceId?: string) {
    streamStoppen();
    const constraints: MediaStreamConstraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
      audio: false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.current = stream;
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    }, 0);
    return stream;
  }

  async function kameraStarten() {
    setHinweis("");
    if (!navigator.mediaDevices?.getUserMedia) {
      fallbackInputRef.current?.click();
      return;
    }
    try {
      await streamStarten();
      setModus("livekamera");
      try {
        const geraete = await navigator.mediaDevices.enumerateDevices();
        const videoGeraete = geraete.filter((g) => g.kind === "videoinput");
        setKameras(videoGeraete);
        setKameraIndex(0);
      } catch {
        // Kameraliste nicht ermittelbar -> Wechsel-Knopf bleibt aus
      }
    } catch {
      setHinweis("Live-Kamera nicht verfügbar – die Kamera-App des Geräts wird geöffnet.");
      fallbackInputRef.current?.click();
    }
  }

  async function kameraWechseln() {
    if (kameras.length < 2) return;
    const naechster = (kameraIndex + 1) % kameras.length;
    try {
      await streamStarten(kameras[naechster].deviceId);
      setKameraIndex(naechster);
    } catch {
      setHinweis("Wechsel zur anderen Kamera nicht möglich.");
    }
  }

  function ausloesen() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const datei = new File([blob], `beleg_${Date.now()}.jpg`, { type: "image/jpeg" });
        streamStoppen();
        setScanQuelle(datei);
        setModus("scannen");
      },
      "image/jpeg",
      0.9
    );
  }

  function kameraAbbrechen() {
    streamStoppen();
    setModus("keine");
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">Beleg (JPG, PNG, PDF)</label>

      {modus === "keine" && !vorschauUrl && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm border rounded px-3 py-2 hover:bg-slate-50">
            <span>Datei wählen</span>
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={dateiGewaehlt}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={kameraStarten}
            className="inline-flex items-center gap-2 text-sm border rounded px-3 py-2 hover:bg-slate-50"
          >
            📷 Foto aufnehmen
          </button>
        </div>
      )}

      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={dateiGewaehlt}
        className="hidden"
      />

      {hinweis && <p className="text-xs text-amber-600 mt-2">{hinweis}</p>}

      {modus === "livekamera" && (
        <div className="mt-3">
          <video ref={videoRef} className="w-full max-w-sm rounded border bg-black" playsInline muted />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={ausloesen}
              className="bg-marke-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-800"
            >
              Auslösen
            </button>
            {kameras.length > 1 && (
              <button
                type="button"
                onClick={kameraWechseln}
                className="text-sm border rounded px-3 py-2 hover:bg-slate-50"
                title="Zwischen den Kameras des Geräts wechseln"
              >
                🔄 Kamera wechseln
              </button>
            )}
            <button type="button" onClick={kameraAbbrechen} className="text-sm text-slate-600 hover:underline px-2">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Beleg-Scanner: Kanten erkennen, Ecken korrigieren, zuschneiden */}
      {modus === "scannen" && scanQuelle && (
        <BelegScanner
          quelle={scanQuelle}
          onFertig={(datei) => {
            setScanQuelle(null);
            setModus("keine");
            setzeVorschau(datei);
          }}
          onAbbrechen={() => {
            setScanQuelle(null);
            setModus("keine");
          }}
        />
      )}

      {vorschauUrl && modus === "keine" && (
        <div className="mt-3">
          {dateiname.toLowerCase().endsWith(".pdf") ? (
            <div className="text-sm text-slate-600 border rounded px-3 py-2">PDF angehängt: {dateiname}</div>
          ) : (
            <img src={vorschauUrl} alt="Belegvorschau" className="w-full max-w-sm rounded border" />
          )}
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={entfernen} className="text-sm text-red-600 hover:underline">
              Entfernen
            </button>
            <button type="button" onClick={kameraStarten} className="text-sm text-marke-700 hover:underline">
              Neu aufnehmen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
