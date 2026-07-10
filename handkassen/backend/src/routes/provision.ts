import { Router, Request, Response } from "express";
import {
  applyDelete,
  applyUpsert,
  provisionSecret,
  ProvisionUserPayload,
} from "../lib/provision.js";

// ---------------------------------------------------------------------------
// Interner Provisionierungs-Endpunkt (nur Suite -> Tool, Docker-Netz).
// Authentifizierung ueber gemeinsames Geheimnis (X-Provision-Secret).
// NICHT ueber nginx veroeffentlicht.
// ---------------------------------------------------------------------------

export const provisionRouter = Router();

provisionRouter.use((req: Request, res: Response, next) => {
  if (req.header("X-Provision-Secret") !== provisionSecret()) {
    res.status(401).json({ fehler: "Nicht autorisiert." });
    return;
  }
  next();
});

// Upsert eines Benutzers.
provisionRouter.put("/user", async (req: Request, res: Response) => {
  const p = req.body as Partial<ProvisionUserPayload>;
  if (!p || typeof p.suiteUserId !== "string" || typeof p.benutzername !== "string") {
    res.status(400).json({ fehler: "Ungültige Nutzlast." });
    return;
  }
  await applyUpsert({
    suiteUserId: p.suiteUserId,
    benutzername: p.benutzername,
    name: p.name ?? p.benutzername,
    email: p.email ?? null,
    aktiv: p.aktiv ?? true,
    rolle: p.rolle ?? null,
  });
  res.json({ ok: true });
});

// Tombstone eines Benutzers.
provisionRouter.delete("/user/:suiteUserId", async (req: Request, res: Response) => {
  await applyDelete(req.params.suiteUserId);
  res.json({ ok: true });
});
