import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { sitzungRouter } from "./routes/sitzung";
import { mitarbeiterRouter } from "./routes/mitarbeiter";
import { anfragenRouter } from "./routes/anfragen";
import { adminRouter } from "./routes/admin";
import { provisionRouter } from "./routes/provision";
import { reconcileVonSuite } from "./lib/provision";
import { starteImapPolling } from "./services/imap";
import { jwtSecret, TOOL_SLUG } from "./lib/suiteAuth";

// Beim Start pruefen (wirft in Produktion bei fehlendem/zu kurzem Secret).
jwtSecret();

const app = express();
const PORT = Number(process.env.PORT ?? 3002);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5174";

// Hinter Reverse-Proxy (nginx): X-Forwarded-* respektieren, damit sichere
// Cookies und Client-IP (Login-Rate-Limits) korrekt ermittelt werden.
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

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
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

app.listen(PORT, () => {
  console.log(
    `Stunden-Backend laeuft auf http://localhost:${PORT} (Tool-Slug: ${TOOL_SLUG})`
  );
  // IMAP-Polling starten. Ruht, solange keine aktive Konfiguration vorliegt.
  starteImapPolling();
  // Benutzer-Spiegel beim Start mit dem Portal abgleichen (Self-Heal).
  void reconcileVonSuite();
});
