// Hinweis auf durch Löschen frei gewordene, noch nicht wieder vergebene
// Belegnummern (Lücke in der Nummerierung). Blockiert nichts, macht die Lücke
// aber vor Abschluss und Export sichtbar (Key-User-Feedback 2026-11).
interface Props {
  nummern: string[];
  zusatz?: string;
  className?: string;
}

export default function FreieNummernHinweis({ nummern, zusatz, className = "" }: Props) {
  if (!nummern.length) return null;
  const einzahl = nummern.length === 1;
  return (
    <div className={`text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2 ${className}`}>
      {einzahl ? "Frei gewordene Belegnummer" : "Frei gewordene Belegnummern"} (Lücke):{" "}
      <span className="font-medium">{nummern.join(", ")}</span>.{" "}
      {zusatz ?? (einzahl
        ? "Sie wird bei der nächsten Buchung dieses Monats wieder vergeben."
        : "Sie werden bei den nächsten Buchungen dieses Monats der Reihe nach wieder vergeben.")}
    </div>
  );
}
