import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Zusatzschutz gegen Cross-Site-Anfragen (Haertung nach Security-Audit 2026-10).
//
// SameSite=Lax schuetzt das Sitzungs-Cookie bereits. Zusaetzlich lehnen wir
// schreibende Anfragen ab, die der Browser selbst als "cross-site" markiert
// (Sec-Fetch-Site). Der Header wird vom Browser gesetzt und haengt nicht von
// Host-/Proxy-Konfiguration ab; Server-zu-Server-Aufrufe (Provisionierung,
// Rechte-Refresh) senden ihn nicht und bleiben unberuehrt.
// ---------------------------------------------------------------------------
const SCHREIBEND = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function fremdeSeitenAbwehren(req: Request, res: Response, next: NextFunction): void {
  if (SCHREIBEND.has(req.method) && req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ fehler: "Anfrage von fremder Seite abgelehnt." });
    return;
  }
  next();
}

// CORS nur fuer die Entwicklung (Vite auf eigenem Port) oder wenn ausdruecklich
// FRONTEND_URL gesetzt ist. In Produktion laufen alle Apps ueber denselben
// Ursprung (nginx), dort braucht es kein CORS.
export function corsAktiv(): boolean {
  return process.env.NODE_ENV !== "production" || Boolean(process.env.FRONTEND_URL);
}
