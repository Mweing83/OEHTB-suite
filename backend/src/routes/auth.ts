import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auditLog } from "../lib/audit";
import {
  passwortHashen,
  passwortPruefen,
  SUITE_COOKIE,
  tokenLoeschen,
  tokenPruefen,
  tokenSetzen,
  tokenSignieren,
} from "../lib/auth";
import { angemeldet, AuthRequest, zugriffeLaden } from "../middleware/auth";

export const authRouter = Router();

// ---------------------------------------------------------------------------
// Brute-Force-Schutz (In-Memory, Muster Handkassen): pro IP+Benutzername
// begrenzte Versuche je Zeitfenster.
// ---------------------------------------------------------------------------
const FENSTER_MS = 15 * 60 * 1000;
const MAX_VERSUCHE = 10;
const versuche = new Map<string, { anzahl: number; bis: number }>();

function loginLimit(req: Request, res: Response, next: NextFunction): void {
  const jetzt = Date.now();
  if (versuche.size > 5000) {
    for (const [k, v] of versuche) if (v.bis < jetzt) versuche.delete(k);
  }
  const benutzername =
    typeof req.body?.benutzername === "string"
      ? req.body.benutzername.toLowerCase()
      : "";
  const key = `${req.ip}|${benutzername}`;
  const e = versuche.get(key);
  if (!e || jetzt > e.bis) {
    versuche.set(key, { anzahl: 1, bis: jetzt + FENSTER_MS });
    next();
    return;
  }
  e.anzahl++;
  if (e.anzahl > MAX_VERSUCHE) {
    res.status(429).json({
      fehler: "Zu viele Versuche. Bitte einige Minuten warten.",
    });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// POST /api/suite/auth/login
// 409 + passwortSetzenErforderlich beim Erstlogin (Muster Handkassen).
// ---------------------------------------------------------------------------
const loginSchema = z.object({
  benutzername: z.string().min(1),
  passwort: z.string().min(1),
});

authRouter.post("/login", loginLimit, async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const { benutzername, passwort } = parse.data;

  const user = await prisma.suiteUser.findUnique({ where: { benutzername } });
  if (!user || !user.aktiv) {
    res.status(401).json({ fehler: "Anmeldung fehlgeschlagen." });
    return;
  }

  if (!user.passwortHash || user.passwortSetzen) {
    res.status(409).json({
      passwortSetzenErforderlich: true,
      benutzername: user.benutzername,
      fehler: "Bitte beim ersten Login ein Passwort festlegen.",
    });
    return;
  }

  const ok = await passwortPruefen(passwort, user.passwortHash);
  if (!ok) {
    res.status(401).json({ fehler: "Anmeldung fehlgeschlagen." });
    return;
  }

  const zugriff = await zugriffeLaden(user.id);
  tokenSetzen(
    res,
    tokenSignieren({
      sub: user.id,
      benutzername: user.benutzername,
      name: user.name,
      zugriff,
    })
  );

  await prisma.suiteUser.update({
    where: { id: user.id },
    data: { letzterLogin: new Date() },
  });
  await auditLog({ userId: user.id, aktion: "LOGIN" });

  res.json({ id: user.id, name: user.name, benutzername: user.benutzername });
});

// ---------------------------------------------------------------------------
// POST /api/suite/auth/passwort-setzen  (Erstlogin, solange passwortSetzen)
// ---------------------------------------------------------------------------
const setzenSchema = z.object({
  benutzername: z.string().min(1),
  neuesPasswort: z.string().min(8, "Mindestens 8 Zeichen."),
});

authRouter.post("/passwort-setzen", loginLimit, async (req, res) => {
  const parse = setzenSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      fehler: parse.error.issues[0]?.message ?? "Ungültige Eingabe.",
    });
    return;
  }
  const { benutzername, neuesPasswort } = parse.data;

  const user = await prisma.suiteUser.findUnique({ where: { benutzername } });
  if (!user || !user.aktiv || !user.passwortSetzen) {
    res.status(403).json({ fehler: "Passwort kann nicht gesetzt werden." });
    return;
  }

  const hash = await passwortHashen(neuesPasswort);
  await prisma.suiteUser.update({
    where: { id: user.id },
    data: { passwortHash: hash, passwortSetzen: false },
  });
  await auditLog({ userId: user.id, aktion: "PASSWORT_GESETZT" });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/suite/auth/passwort-aendern  (Selbstbedienung, angemeldet)
// ---------------------------------------------------------------------------
const aendernSchema = z.object({
  aktuellesPasswort: z.string().min(1),
  neuesPasswort: z.string().min(8, "Mindestens 8 Zeichen."),
});

authRouter.post(
  "/passwort-aendern",
  angemeldet,
  async (req: AuthRequest, res: Response) => {
    const parse = aendernSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        fehler: parse.error.issues[0]?.message ?? "Ungültige Eingabe.",
      });
      return;
    }
    const { aktuellesPasswort, neuesPasswort } = parse.data;

    const user = await prisma.suiteUser.findUnique({
      where: { id: req.benutzer!.sub },
    });
    if (!user || !user.aktiv || !user.passwortHash) {
      res.status(403).json({ fehler: "Passwortänderung nicht möglich." });
      return;
    }

    const ok = await passwortPruefen(aktuellesPasswort, user.passwortHash);
    if (!ok) {
      res.status(401).json({ fehler: "Das aktuelle Passwort ist nicht korrekt." });
      return;
    }
    if (aktuellesPasswort === neuesPasswort) {
      res.status(400).json({
        fehler: "Das neue Passwort muss sich vom alten unterscheiden.",
      });
      return;
    }

    const hash = await passwortHashen(neuesPasswort);
    await prisma.suiteUser.update({
      where: { id: user.id },
      data: { passwortHash: hash, passwortSetzen: false },
    });
    await auditLog({ userId: user.id, aktion: "PASSWORT_GEAENDERT" });

    res.json({ ok: true });
  }
);

// ---------------------------------------------------------------------------
// POST /api/suite/auth/logout
// ---------------------------------------------------------------------------
authRouter.post("/logout", async (req: AuthRequest, res) => {
  // Best effort: auch ohne gueltiges Token Cookie loeschen.
  try {
    const token = req.cookies?.[SUITE_COOKIE];
    if (token) {
      const inhalt = tokenPruefen(token);
      await auditLog({ userId: inhalt.sub, aktion: "LOGOUT" });
    }
  } catch {
    // ignorieren
  }
  tokenLoeschen(res);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/suite/auth/me – Sitzung + erlaubte Tools (fuer die Kachelseite)
// ---------------------------------------------------------------------------
authRouter.get("/me", angemeldet, async (req: AuthRequest, res: Response) => {
  const b = req.benutzer!;
  const tools = await prisma.tool.findMany({
    where: { aktiv: true, slug: { in: Object.keys(b.zugriff) } },
    orderBy: { reihenfolge: "asc" },
    select: { slug: true, name: true, beschreibung: true, pfad: true },
  });
  res.json({
    id: b.sub,
    name: b.name,
    benutzername: b.benutzername,
    zugriff: b.zugriff,
    tools,
  });
});

// ---------------------------------------------------------------------------
// POST /api/suite/auth/refresh – von den TOOL-Backends aufgerufen, wenn ihre
// Token-Rechte aelter als PRUEF_INTERVALL_MS sind. Prueft Benutzer + Rechte
// frisch und liefert ein neues Token im Body (das Tool setzt das Cookie).
// ---------------------------------------------------------------------------
authRouter.post("/refresh", async (req: AuthRequest, res: Response) => {
  const token = req.cookies?.[SUITE_COOKIE] ?? req.body?.token;
  if (!token) {
    res.status(401).json({ fehler: "Kein Token." });
    return;
  }
  try {
    const roh = tokenPruefen(token);
    const user = await prisma.suiteUser.findUnique({ where: { id: roh.sub } });
    if (!user || !user.aktiv) {
      res.status(401).json({ fehler: "Benutzer nicht (mehr) aktiv." });
      return;
    }
    const zugriff = await zugriffeLaden(user.id);
    const neues = tokenSignieren({
      sub: user.id,
      benutzername: user.benutzername,
      name: user.name,
      zugriff,
      letzteAktivitaet: roh.letzteAktivitaet, // Aktivitaet erneuert das TOOL
    });
    res.json({ token: neues });
  } catch {
    res.status(401).json({ fehler: "Ungültige Sitzung." });
  }
});
