// Muss vor den Router-Importen stehen: patcht Express so, dass auch Fehler aus
// asynchronen Handlern beim zentralen Error-Handler landen. Muster: stunden.
import "express-async-errors";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { prisma } from "./lib/prisma";
import { sitzungRouter } from "./routes/sitzung";
import { provisionRouter } from "./routes/provision";
import { quellenRouter } from "./routes/quellen";
import { ausschreibungenRouter } from "./routes/ausschreibungen";
import { einstellungenRouter } from "./routes/einstellungen";
import { reconcileVonSuite, provisionSecret } from "./lib/provision";
import { jwtSecret } from "./lib/suiteAuth";

// Beim Start pruefen (wirft in Produktion bei fehlendem/schwachem Secret) –
// fail-fast statt erst beim ersten Request bzw. beim ersten Provisionierungs-Push.
jwtSecret();
provisionSecret();
if (process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE === "1") {
  console.warn(
    "WARNUNG: COOKIE_INSECURE=1 – Session-Cookies werden ohne 'secure'-Flag gesetzt (nur hinter TLS/Tailscale vertretbar)."
  );
}

export const app = express();
const PORT = Number(process.env.PORT ?? 3003);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5176";

if (process.env.TRUST_PROXY) {
  const wert = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isFinite(wert) ? wert : process.env.TRUST_PROXY);
}

// Sicherheits-Header via helmet – identische Direktiven wie stunden/backend.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "upgrade-insecure-requests": null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" },
  })
);

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Gesundheitscheck
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", zeit: new Date().toISOString() });
});

// Routen (Login/Logout liegen seit der Suite-Integration im Portal, siehe
// middleware/auth.ts – dieses Backend verifiziert nur noch das SSO-Token).
app.use("/api/auth", sitzungRouter);
app.use("/api/quellen", quellenRouter);
app.use("/api/ausschreibungen", ausschreibungenRouter);
app.use("/api/einstellungen", einstellungenRouter);
app.use("/api/provision", provisionRouter);

// Produktivbetrieb: gebaute SPA ausliefern (Muster stunden/handkassen).
const STATIC_DIR = process.env.STATIC_DIR;
if (STATIC_DIR && fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
}

// Zentrale Fehlerbehandlung (faengt dank express-async-errors auch async).
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unbehandelter Fehler:", err);
    if (res.headersSent) return;
    res.status(500).json({ fehler: "Interner Serverfehler." });
  }
);

// Im Testbetrieb wird die App nur importiert, nicht gestartet.
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(`Foerderungen-Backend laeuft auf http://localhost:${PORT}`);
    // Benutzer-Spiegel beim Start mit dem Portal abgleichen (Self-Heal).
    void reconcileVonSuite();
  });

  let faehrtHerunter = false;
  const herunterfahren = async (signal: string) => {
    if (faehrtHerunter) return;
    faehrtHerunter = true;
    console.log(`${signal} empfangen – Foerderungen-Backend faehrt herunter...`);
    const notausstieg = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(async () => {
      try {
        await prisma.$disconnect();
      } catch {
        /* egal */
      }
      clearTimeout(notausstieg);
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => void herunterfahren("SIGTERM"));
  process.on("SIGINT", () => void herunterfahren("SIGINT"));

  process.on("unhandledRejection", (grund) => {
    console.error("Unbehandelte Promise-Ablehnung:", grund);
  });
  process.on("uncaughtException", (fehler) => {
    console.error("Unerwarteter Fehler (uncaughtException):", fehler);
  });
}
