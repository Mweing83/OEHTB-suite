// Link-Normalisierung fuer den Dedup-Abgleich (Kleinschreibung, ohne
// Protokoll/www/Tracking-Parameter/abschliessenden Slash).
export function normalisiereLink(roh: string): string {
  try {
    const url = new URL(roh);
    const params = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (!/^(utm_|fbclid|gclid)/i.test(k)) params.append(k, v);
    }
    const query = params.toString();
    return (
      url.hostname.toLowerCase().replace(/^www\./, "") +
      url.pathname.replace(/\/+$/, "").toLowerCase() +
      (query ? "?" + query : "")
    );
  } catch {
    return roh.trim().toLowerCase();
  }
}
