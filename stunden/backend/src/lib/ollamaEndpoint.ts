// ---------------------------------------------------------------------------
// Pruefung der Ollama-Endpoint-URL (Security-Audit 2026-10).
//
// Die URL setzt ein Admin; der Server ruft sie dann selbst auf. Damit daraus
// kein beliebiger Abruf interner Adressen wird, gilt:
// - nur http/https, keine Zugangsdaten, kein Query-String, kein Fragment,
// - optional nur Hosts aus OLLAMA_ERLAUBTE_HOSTS (kommagetrennt, z. B.
//   "localhost,ollama,host.docker.internal"); leer = keine Einschraenkung.
// Liefert die normalisierte Basis-URL (ohne abschliessenden "/") oder null.
// ---------------------------------------------------------------------------
export function ollamaBasisUrl(roh: string): string | null {
  let url: URL;
  try {
    url = new URL(roh.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;

  const erlaubt = (process.env.OLLAMA_ERLAUBTE_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (erlaubt.length > 0 && !erlaubt.includes(url.hostname.toLowerCase())) return null;

  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}
