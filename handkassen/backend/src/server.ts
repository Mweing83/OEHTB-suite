import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { authRouter } from "./routes/auth.js";
import { stammdatenRouter } from "./routes/stammdaten.js";
import { buchungRouter } from "./routes/buchungen.js";
import { abschlussRouter } from "./routes/abschluss.js";
import { exportRouter } from "./routes/export.js";
import { adminRouter } from "./routes/admin.js";
import { berichtRouter } from "./routes/berichte.js";
import { provisionRouter } from "./routes/provision.js";
import { reconcileVonSuite } from "./lib/provision.js";

export const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Hinter einem TLS-terminierenden Reverse-Proxy / Tailscale: TRUST_PROXY setzen
// (z. B. TRUST_PROXY=1). Dann erkennt Express über X-Forwarded-Proto, dass die
// ursprüngliche Anfrage HTTPS war, und sendet das `secure`-Cookie korrekt.
// Ohne Proxy bleibt dies AUS, damit die Client-IP nicht fälschbar ist.
if (process.env.TRUST_PROXY) {
  const wert = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isNaN(wert) ? process.env.TRUST_PROXY : wert);
}

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Grundlegende Sicherheits-Header für alle Antworten.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// Routen
app.use("/api/auth", authRouter);
app.use("/api", stammdatenRouter);
app.use("/api/buchungen", buchungRouter);
app.use("/api/abschluss", abschlussRouter);
app.use("/api/export", exportRouter);
app.use("/api/admin", adminRouter);
app.use("/api/berichte", berichtRouter);
app.use("/api/provision", provisionRouter);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Gebautes Frontend ausliefern (Single-Origin: SPA + API auf einem Port).
// Nur aktiv, wenn STATIC_DIR gesetzt ist und existiert – im Dev-Betrieb
// (Vite auf Port 5173) bleibt dies aus.
const STATIC_DIR = process.env.STATIC_DIR;
if (STATIC_DIR && fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  // SPA-Fallback: alle Nicht-API-Routen liefern index.html (React-Router übernimmt).
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
}

// Zentrale Fehlerbehandlung: fängt dank "express-async-errors" auch Fehler aus
// asynchronen Handlern und antwortet sauber, statt den Request hängen zu lassen.
// Interne Details werden nicht nach außen gegeben.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unbehandelter Fehler:", err);
  if (res.headersSent) return;
  res.status(500).json({ fehler: "Interner Serverfehler." });
});

// Letzte Sicherung: unerwartete Fehler protokollieren, statt den Prozess
// unbemerkt hängen/sterben zu lassen.
process.on("unhandledRejection", (grund) => {
  console.error("Unbehandelte Promise-Ablehnung:", grund);
});
process.on("uncaughtException", (fehler) => {
  console.error("Unerwarteter Fehler (uncaughtException):", fehler);
});

// Im Testbetrieb (Integrationstests mit supertest) wird die App nur importiert,
// nicht gestartet – supertest spricht sie direkt an, ohne offenen Port.
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Handkassen-API läuft auf Port ${PORT}`);
    // Benutzer-Spiegel beim Start mit dem Portal abgleichen (Self-Heal).
    void reconcileVonSuite();
  });
}
