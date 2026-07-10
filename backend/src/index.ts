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

// Beim Start pruefen (wirft in Produktion bei fehlendem/zu kurzem Secret).
jwtSecret();
provisionSecret();

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

app.listen(PORT, () => {
  console.log(`Suite-Backend laeuft auf http://localhost:${PORT}`);
  // Provisionierungs-Outbox zustellen (Benutzer-Sync an die Tools).
  starteProvisionWorker();
});
