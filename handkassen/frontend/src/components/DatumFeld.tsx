import { useEffect, useRef, useState } from "react";

// Wandelt ISO ("2026-05-09") in das deutsche Format ("09.05.2026") um.
export function isoZuDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

// Wandelt das deutsche Format ("9.5.2026" oder "09.05.2026") in ISO ("2026-05-09")
// um. Gibt "" zurück, wenn die Eingabe (noch) kein gültiges Datum ist.
export function deZuIso(text: string): string {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((text || "").trim());
  if (!m) return "";
  const tag = Number(m[1]);
  const monat = Number(m[2]);
  const jahr = Number(m[3]);
  const d = new Date(jahr, monat - 1, tag);
  // Echte Gültigkeit prüfen (weist z. B. den 31.02. ab).
  if (d.getFullYear() !== jahr || d.getMonth() !== monat - 1 || d.getDate() !== tag) return "";
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

interface Props {
  // Wert immer im ISO-Format ("JJJJ-MM-TT") oder "" – so wie der Rest der App rechnet.
  wert: string;
  onChange: (iso: string) => void;
  className?: string;
  size?: "normal" | "klein";
}

// Datumsfeld im deutschen Format (TT.MM.JJJJ). Anzeige und Eingabe sind immer
// deutsch – unabhängig von der Browser-/Windows-Spracheinstellung. Über das
// Kalendersymbol lässt sich zusätzlich der native Kalender öffnen.
export default function DatumFeld({ wert, onChange, className = "", size = "normal" }: Props) {
  const [text, setText] = useState(isoZuDe(wert));
  const [fehlerhaft, setFehlerhaft] = useState(false);
  const nativeRef = useRef<HTMLInputElement | null>(null);

  // Wert von außen übernehmen (z. B. Zurücksetzen oder Bearbeiten-Vorlage).
  useEffect(() => {
    setText(isoZuDe(wert));
    setFehlerhaft(false);
  }, [wert]);

  function textGeaendert(roh: string) {
    setText(roh);
    if (roh.trim() === "") {
      setFehlerhaft(false);
      onChange("");
      return;
    }
    const iso = deZuIso(roh);
    if (iso) {
      setFehlerhaft(false);
      onChange(iso);
    } else {
      // Noch unvollständige/ungültige Eingabe: nicht nach außen melden, nur markieren.
      setFehlerhaft(true);
    }
  }

  function beimVerlassen() {
    // Gültige Eingabe sauber ausschreiben ("9.5.2026" -> "09.05.2026").
    const iso = deZuIso(text);
    if (iso) setText(isoZuDe(iso));
  }

  function kalenderOeffnen() {
    const el = nativeRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (el && typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* fällt unten auf focus() zurück */
      }
    }
    el?.focus();
  }

  const groesse = size === "klein" ? "px-3 py-1.5 text-sm" : "px-3 py-2";

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="TT.MM.JJJJ"
        className={`w-full border rounded pr-9 ${groesse} ${fehlerhaft ? "border-red-400 bg-red-50" : ""}`}
        value={text}
        onChange={(e) => textGeaendert(e.target.value)}
        onBlur={beimVerlassen}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={kalenderOeffnen}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
        title="Kalender öffnen"
        aria-label="Kalender öffnen"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
      {/* Nativer Kalender, unsichtbar – dient nur als Auswahl-Popup über das Symbol. */}
      <input
        ref={nativeRef}
        type="date"
        value={wert}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
