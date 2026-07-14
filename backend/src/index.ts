import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { authRouter } from "./routes/auth";
import { adminRouter } from "./routes/admin";
import { provisionRouter } from "./routes/provision";
import { jwtSecret } from "./lib/auth";
import { provisionSecret } from "./lib/provision";
import { starteProvisionWorker } from "./lib/provisionWorker";
import { prisma } from "./lib/prisma";

// Beim Start pruefen (wirft in Produktion bei fehlendem/schwachem Secret).
jwtSecret();
provisionSecret();
if (process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE === "1") {
  console.warn(
    "WARNUNG: COOKIE_INSECURE=1 – Session-Cookies werden ohne 'secure'-Flag gesetzt (nur hinter TLS/Tailscale vertretbar)."
  );
}

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5175";

// Hinter Reverse-Proxy (nginx): X-Forwarded-* respektieren.
if (process.env.TRUST_PROXY) {
  const wert = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isFinite(wert) ? wert : process.env.TRUST_PROXY);
}

// Sicherheits-Header (Muster Handkassen).
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/suite/health", (_req, res) => {
  res.json({ status: "ok", zeit: new Date().toISOString() });
});

app.use("/api/suite/auth", authRouter);
app.use("/api/suite/admin", adminRouter);
app.use("/api/suite/provision", provisionRouter);

// Produktivbetrieb: gebaute Portal-SPA ausliefern (Muster Handkassen).
const STATIC_DIR = process.env.STATIC_DIR;
if (STATIC_DIR && fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
}

const server = app.listen(PORT, () => {
  console.log(`Suite-Backend laeuft auf http://localhost:${PORT}`);
  // Provisionierungs-Outbox zustellen (Benutzer-Sync an die Tools).
  starteProvisionWorker();
});

// Sauberes Herunterfahren: Docker sendet beim Stop SIGTERM. Laufende Anfragen
// zu Ende bedienen, HTTP-Server schliessen, DB-Verbindung trennen. Ein Timeout
// erzwingt den Ausstieg, falls sich der Server nicht schliessen laesst.
let faehrtHerunter = false;
async function herunterfahren(signal: string) {
  if (faehrtHerunter) return;
  faehrtHerunter = true;
  console.log(`${signal} empfangen – Suite-Backend faehrt herunter...`);
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
}
process.on("SIGTERM", () => void herunterfahren("SIGTERM"));
process.on("SIGINT", () => void herunterfahren("SIGINT"));
