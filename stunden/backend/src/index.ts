// Muss vor den Router-Importen stehen: patcht Express so, dass auch Fehler aus
// asynchronen Handlern beim zentralen Error-Handler landen (statt den Request
// haengen zu lassen). Muster: Handkassen.
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { corsAktiv, fremdeSeitenAbwehren } from "./lib/herkunft";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { sitzungRouter } from "./routes/sitzung";
import { mitarbeiterRouter } from "./routes/mitarbeiter";
import { anfragenRouter } from "./routes/anfragen";
import { adminRouter } from "./routes/admin";
import { provisionRouter } from "./routes/provision";
import { reconcileVonSuite, provisionSecret } from "./lib/provision";
import { starteImapPolling } from "./services/imap";
import { jwtSecret, TOOL_SLUG } from "./lib/suiteAuth";
import { pruefeVerschluesselungsKey } from "./lib/krypto";
import { prisma } from "./lib/prisma";

// Beim Start pruefen (wirft in Produktion bei fehlendem/schwachem Secret) –
// fail-fast statt erst beim ersten Request bzw. beim ersten Provisionierungs-Push.
// Fail-fast: Produktionsstart mit einem der oeffentlich im Repo stehenden
// Standard-/Entwicklungspasswoerter in der DATABASE_URL ablehnen.
function pruefeDatenbankPasswort(): void {
  const url = process.env.DATABASE_URL ?? "";
  const schwach = /_dev_passwort|\/\/handkassen:handkassen@|bitte|changeme/i.test(url);
  if (process.env.NODE_ENV === "production" && schwach) {
    throw new Error(
      "DATABASE_URL verwendet ein bekanntes Standard-Passwort - vor dem Produktivbetrieb ein starkes Passwort setzen (.env)."
    );
  }
}

jwtSecret();
provisionSecret();
pruefeVerschluesselungsKey();
pruefeDatenbankPasswort();
if (process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE === "1") {
  console.warn(
    "WARNUNG: COOKIE_INSECURE=1 – Session-Cookies werden ohne 'secure'-Flag gesetzt (nur hinter TLS/Tailscale vertretbar)."
  );
}

export const app = express();
const PORT = Number(process.env.PORT ?? 3002);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5174";

// Hinter Reverse-Proxy (nginx): X-Forwarded-* respektieren, damit sichere
// Cookies und Client-IP (Login-Rate-Limits) korrekt ermittelt werden.
if (process.env.TRUST_PROXY) {
  const wert = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isFinite(wert) ? wert : process.env.TRUST_PROXY);
}

// Sicherheits-Header via helmet. CSP bewusst SPA-tauglich gehalten (Single-
// Origin: gebaute Assets + API unter 'self'). "upgrade-insecure-requests" ist
// AUS, damit die Suite auch ueber reines HTTP im LAN erreichbar bleibt.
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

if (corsAktiv()) {
  app.use(
    cors({
      origin: FRONTEND_URL,
      credentials: true,
    })
  );
}
app.use(fremdeSeitenAbwehren);
app.use(express.json());
app.use(cookieParser());

// Gesundheitscheck
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", zeit: new Date().toISOString() });
});

// Routen (Login/Logout liegen seit der Suite-Integration im Portal, siehe
// middleware/auth.ts – dieses Backend verifiziert nur noch das SSO-Token).
app.use("/api/auth", sitzungRouter);
app.use("/api/mitarbeiter", mitarbeiterRouter);
app.use("/api/anfragen", anfragenRouter);
app.use("/api/admin", adminRouter);
app.use("/api/provision", provisionRouter);

// Produktivbetrieb: gebaute SPA ausliefern (Muster Handkassen).
const STATIC_DIR = process.env.STATIC_DIR;
if (STATIC_DIR && fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
}

// Zentrale Fehlerbehandlung: faengt (Express 5 leitet Fehler aus async-Handlern selbst weiter) auch Fehler
// aus asynchronen Handlern und antwortet sauber, ohne interne Details preiszugeben.
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

// Im Testbetrieb (Integrationstests mit supertest) wird die App nur importiert,
// nicht gestartet – supertest spricht sie direkt an, ohne offenen Port.
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(
      `Stunden-Backend laeuft auf http://localhost:${PORT} (Tool-Slug: ${TOOL_SLUG})`
    );
    // IMAP-Polling starten. Ruht, solange keine aktive Konfiguration vorliegt.
    starteImapPolling();
    // Benutzer-Spiegel beim Start mit dem Portal abgleichen (Self-Heal).
    void reconcileVonSuite();
  });

  // Sauberes Herunterfahren: Docker sendet beim Stop SIGTERM. Laufende Anfragen
  // zu Ende bedienen, HTTP-Server schliessen, DB-Verbindung trennen. Ein Timeout
  // erzwingt den Ausstieg, falls sich der Server nicht schliessen laesst.
  let faehrtHerunter = false;
  const herunterfahren = async (signal: string) => {
    if (faehrtHerunter) return;
    faehrtHerunter = true;
    console.log(`${signal} empfangen – Stunden-Backend faehrt herunter...`);
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

  // Letzte Sicherung: unerwartete Fehler protokollieren, statt den Prozess
  // unbemerkt sterben zu lassen (Muster Handkassen).
  process.on("unhandledRejection", (grund) => {
    console.error("Unbehandelte Promise-Ablehnung:", grund);
  });
  process.on("uncaughtException", (fehler) => {
    console.error("Unerwarteter Fehler (uncaughtException):", fehler);
  });
}
