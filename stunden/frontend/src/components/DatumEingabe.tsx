import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Datums-Eingabefeld im europaeischen Layout TT/MM/JJJJ – mit eigenem
// Kalender-Popover (Wochenstart Montag, deutsche Beschriftung).
//
// Warum eigener Kalender? Das native <input type="date"> zeigt das Datum je
// nach Browser-Sprache mal TT.MM.JJJJ, mal MM/TT/JJJJ – nicht erzwingbar.
// Dieser Kalender ist immer europaeisch (TT/MM/JJJJ, Montag zuerst).
//
// Nach aussen arbeitet die Komponente mit ISO (JJJJ-MM-TT), wie der Rest der
// Anwendung und das Backend.
// value:    ISO-String (JJJJ-MM-TT) oder "" wenn (noch) kein gueltiges Datum.
// onChange: liefert ISO-String bei gueltigem Datum, sonst "".
// ---------------------------------------------------------------------------

interface Props {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  id?: string;
}

const MONATE = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// ISO (JJJJ-MM-TT) -> Anzeige TT/MM/JJJJ.
function isoZuEu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Eingabe TT/MM/JJJJ -> ISO (JJJJ-MM-TT). Leer, wenn kein gueltiges
// Kalenderdatum (z. B. 31/02). Akzeptiert auch "." und "-" als Trenner.
function euZuIso(eu: string): string {
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(eu.trim());
  if (!m) return "";
  const tag = pad(Number(m[1]));
  const monat = pad(Number(m[2]));
  const jahr = m[3];
  const d = new Date(`${jahr}-${monat}-${tag}T00:00:00`);
  if (
    d.getFullYear() !== Number(jahr) ||
    d.getMonth() + 1 !== Number(monat) ||
    d.getDate() !== Number(tag)
  ) {
    return "";
  }
  return `${jahr}-${monat}-${tag}`;
}

// Wochentag-Index mit Montag=0 ... Sonntag=6.
function montagBasiert(wochentag: number): number {
  return (wochentag + 6) % 7;
}

export default function DatumEingabe({ value, onChange, className, id }: Props) {
  const [text, setText] = useState(isoZuEu(value));
  const [offen, setOffen] = useState(false);
  // Im Kalender angezeigter Monat (erster Tag des Monats).
  const [anzeigeMonat, setAnzeigeMonat] = useState<Date>(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return m
      ? new Date(Number(m[1]), Number(m[2]) - 1, 1)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Aenderungen von aussen uebernehmen (z. B. KI-Vorbelegung), aber den gerade
  // getippten Text nicht ueberschreiben, wenn er dasselbe Datum bedeutet.
  useEffect(() => {
    if (value !== euZuIso(text)) {
      setText(isoZuEu(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Klick ausserhalb schliesst das Popover.
  useEffect(() => {
    if (!offen) return;
    function beiKlick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOffen(false);
      }
    }
    document.addEventListener("mousedown", beiKlick);
    return () => document.removeEventListener("mousedown", beiKlick);
  }, [offen]);

  function textGeaendert(neu: string) {
    setText(neu);
    onChange(euZuIso(neu));
  }

  function oeffnen() {
    // Kalender auf das aktuell gewaehlte Datum (falls vorhanden) ausrichten.
    const iso = euZuIso(text) || value;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (m) setAnzeigeMonat(new Date(Number(m[1]), Number(m[2]) - 1, 1));
    setOffen((o) => !o);
  }

  function tagWaehlen(tag: number) {
    const iso = `${anzeigeMonat.getFullYear()}-${pad(
      anzeigeMonat.getMonth() + 1
    )}-${pad(tag)}`;
    setText(isoZuEu(iso));
    onChange(iso);
    setOffen(false);
  }

  function monatWechseln(richtung: number) {
    setAnzeigeMonat(
      (m) => new Date(m.getFullYear(), m.getMonth() + richtung, 1)
    );
  }

  // Kalender-Gitter aufbauen.
  const jahr = anzeigeMonat.getFullYear();
  const monat = anzeigeMonat.getMonth();
  const ersterWochentag = montagBasiert(new Date(jahr, monat, 1).getDay());
  const tageImMonat = new Date(jahr, monat + 1, 0).getDate();
  const gewaehltesIso = euZuIso(text) || value;
  const heuteIso = `${new Date().getFullYear()}-${pad(
    new Date().getMonth() + 1
  )}-${pad(new Date().getDate())}`;

  const zellen: (number | null)[] = [];
  for (let i = 0; i < ersterWochentag; i++) zellen.push(null);
  for (let t = 1; t <= tageImMonat; t++) zellen.push(t);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => textGeaendert(e.target.value)}
          placeholder="TT/MM/JJJJ"
          maxLength={10}
          className={className}
        />
        <button
          type="button"
          onClick={oeffnen}
          aria-label="Kalender öffnen"
          className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-400 hover:text-gray-600"
        >
          {/* Kalender-Symbol */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>
      </div>

      {offen && (
        <div className="absolute z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => monatWechseln(-1)}
              aria-label="Vorheriger Monat"
              className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-gray-800">
              {MONATE[monat]} {jahr}
            </span>
            <button
              type="button"
              onClick={() => monatWechseln(1)}
              aria-label="Nächster Monat"
              className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400">
            {WOCHENTAGE.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-sm">
            {zellen.map((tag, i) => {
              if (tag === null) return <div key={`leer-${i}`} />;
              const zellIso = `${jahr}-${pad(monat + 1)}-${pad(tag)}`;
              const istGewaehlt = zellIso === gewaehltesIso;
              const istHeute = zellIso === heuteIso;
              return (
                <button
                  key={zellIso}
                  type="button"
                  onClick={() => tagWaehlen(tag)}
                  className={
                    "rounded py-1 hover:bg-blue-100 " +
                    (istGewaehlt
                      ? "bg-blue-600 text-white hover:bg-blue-600"
                      : istHeute
                      ? "border border-blue-400 text-blue-700"
                      : "text-gray-700")
                  }
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
