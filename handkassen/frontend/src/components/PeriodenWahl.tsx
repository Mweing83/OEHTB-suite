interface Props {
  jahr: number;
  monat: number;
  onChange: (jahr: number, monat: number) => void;
  // id der Jahr-Auswahl, damit ein <label htmlFor> darauf zeigen kann.
  id?: string;
  className?: string;
}

const feld = "border rounded-sm px-3 py-2";

// Auswahl der Periode (Jahr und Monat) – überall in der Handkasse gleich:
// Buchungen, Monatsabschluss, Berichte und Export. Zwei Auswahllisten statt
// Zahlenfeldern, damit nur gültige Perioden entstehen.
export default function PeriodenWahl({ jahr, monat, onChange, id, className = "" }: Props) {
  // Zehn Jahre zurück (Aufbewahrungsfrist) und eines voraus; ein außerhalb
  // liegendes gewähltes Jahr bleibt wählbar.
  const heuer = new Date().getFullYear();
  const jahre = Array.from({ length: 12 }, (_, i) => heuer - 10 + i);
  if (!jahre.includes(jahr)) jahre.push(jahr);
  jahre.sort((a, b) => a - b);

  return (
    <div className={`flex gap-2 ${className}`}>
      <select
        id={id}
        aria-label="Jahr"
        className={feld}
        value={jahr}
        onChange={(e) => onChange(Number(e.target.value), monat)}
      >
        {jahre.map((j) => (
          <option key={j} value={j}>{j}</option>
        ))}
      </select>
      <select
        aria-label="Monat"
        className={feld}
        value={monat}
        onChange={(e) => onChange(jahr, Number(e.target.value))}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
        ))}
      </select>
    </div>
  );
}
