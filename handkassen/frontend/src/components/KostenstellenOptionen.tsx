// <option>-Liste der Kostenstellen, bei mehreren Firmen nach Firma gruppiert
// (<optgroup>). Für Seiten, die keine eigene Firmenauswahl haben.
interface Ks {
  id: number;
  nummer: string;
  bezeichnung: string;
  bereich?: { bezeichnung: string };
  firma?: { id: number; name: string };
}

function text(k: Ks): string {
  return `${k.nummer} ${k.bezeichnung}${k.bereich ? ` (${k.bereich.bezeichnung})` : ""}`;
}

export default function KostenstellenOptionen({ liste }: { liste: Ks[] }) {
  const firmen = Array.from(new Map(liste.filter((k) => k.firma).map((k) => [k.firma!.id, k.firma!])).values()).sort(
    (a, b) => a.id - b.id
  );
  if (firmen.length <= 1) {
    return (
      <>
        {liste.map((k) => (
          <option key={k.id} value={k.id}>{text(k)}</option>
        ))}
      </>
    );
  }
  return (
    <>
      {firmen.map((f) => (
        <optgroup key={f.id} label={f.name}>
          {liste.filter((k) => k.firma?.id === f.id).map((k) => (
            <option key={k.id} value={k.id}>{text(k)}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
