# Werkzeug „Förderungen" – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neues Suite-Werkzeug `foerderungen` (österreichische Förderlandschaft + Ausschreibungsfristen) mit KI-Scanner, Prüf-Warteschlange und LLM-Einstellungen nach dem `stunden`-Muster.

**Architecture:** Eigenständiges Tool im Ordner `foerderungen/` (Express + Prisma + eigener Postgres, React + Vite + Tailwind), SSO über das gemeinsame `suite_token`-Cookie, Anbindung über Tool-Registry, nginx-Location und docker-compose. Scanner als node-cron-Job im Backend, LLM-Zugriff über Provider-Factory (anthropic/openai/dummy) mit providerseitiger Websuche.

**Tech Stack:** Node 20, Express 4, Prisma 5 (Postgres 16), TypeScript 5, vitest + supertest, React 18, Vite 6, Tailwind 3, react-router-dom 6, node-cron.

**Spec:** `docs/superpowers/specs/2026-07-16-foerderungen-design.md`

## Global Constraints

- **Deutsch überall:** Bezeichner, Kommentare, UI-Texte, Commit-Botschaften (ASCII-Umlaute in Commits: `ae/oe/ue`, wie bestehende Historie).
- **Suite-Konventionen:** Muster-Quelle ist IMMER das `stunden`-Tool. Kein Cross-Ordner-Import – gemeinsame Dateien werden bewusst **dupliziert** (krypto, suiteAuth, api.ts, tailwind.config.js …).
- **Tool-Slug:** `foerderungen`, Backend-Port **3003**, Vite-Dev-Port **5176**, Dev-DB-Hostport **5435**, eine Rolle: `nutzer`.
- **Design-Tokens:** `tailwind.config.js` byte-identisch aus `portal/tailwind.config.js` übernehmen (marke-Navy, erfolg/warnung/gefahr).
- **Fehler-JSON:** immer `{ fehler: "…" }` (deutsch), Erfolg bei Mutationen `{ ok: true }` oder das Objekt.
- **API-Key nie im Klartext zurückgeben** – nur `apiKeyGesetzt: boolean`.
- **Tests:** vitest, Integrationstests nur bei gesetzter `TEST_DATABASE_URL` (Muster `stunden/backend/src/test/setup.ts`); seriell (`fileParallelism: false`).
- Testkommandos laufen aus `foerderungen/backend/` mit PowerShell: `npx cross-env TEST_DATABASE_URL=postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen_test vitest run <datei>` (cross-env ist devDependency; Test-DB `foerderungen_test` wird in Task 1 angelegt).

## Datei-Struktur (Ziel)

```
foerderungen/
├── docker-compose.yml            # Dev-DB (Port 5435)
├── backend/
│   ├── Dockerfile                # Mehrstufig, Muster stunden/backend/Dockerfile
│   ├── package.json / tsconfig.json / vitest.config.ts / .env.example
│   ├── prisma/schema.prisma      # Foerderquelle, Ausschreibung, ScanLauf, User, AuditLog, Einstellung
│   ├── prisma/seed.ts            # Initialkatalog Foerderquellen
│   └── src/
│       ├── index.ts              # App, Helmet/CORS, Routen, Zeitplan-Start, Shutdown
│       ├── lib/  prisma.ts, suiteAuth.ts, krypto.ts, provision.ts, audit.ts
│       ├── middleware/auth.ts    # SSO, eine Rolle "nutzer"
│       ├── routes/ sitzung.ts, provision.ts, quellen.ts, ausschreibungen.ts, scans.ts, einstellungen.ts
│       ├── services/
│       │   ├── llm/ typen.ts, dummy.ts, anthropic.ts, openai.ts, factory.ts
│       │   ├── scanner.ts        # Dedup, Scan-Orchestrierung
│       │   └── zeitplan.ts       # node-cron: Scan + Fristablauf
│       └── test/ setup.ts, helfer.ts + *.test.ts neben den Modulen
└── frontend/
    ├── package.json / tsconfig.json / vite.config.ts / index.html
    ├── tailwind.config.js / postcss.config.js
    └── src/
        ├── main.tsx, App.tsx, index.css
        ├── lib/ api.ts, auth.tsx, typen.ts
        ├── components/ Layout.tsx
        └── pages/ AusschreibungenSeite.tsx, LandschaftSeite.tsx, QuelleDetailSeite.tsx,
                   PruefenSeite.tsx, ScansSeite.tsx, EinstellungenSeite.tsx
```

Suite-Integration (Änderungen außerhalb `foerderungen/`): `backend/prisma/seed.ts` (Registry), `nginx/nginx.conf`, `docker-compose.yml`, `.env.example`, `README.md`.

---

### Task 1: Backend-Grundgerüst (App, Prisma-Schema, Health-Endpunkt)

**Files:**
- Create: `foerderungen/docker-compose.yml`
- Create: `foerderungen/backend/package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Create: `foerderungen/backend/prisma/schema.prisma`
- Create: `foerderungen/backend/src/lib/prisma.ts`
- Create: `foerderungen/backend/src/index.ts`
- Test: `foerderungen/backend/src/test/setup.ts`, `foerderungen/backend/src/index.test.ts`

**Interfaces:**
- Produces: Express-`app` (benannter Export aus `src/index.ts`), `prisma`-Singleton (`src/lib/prisma.ts`), Prisma-Modelle `Foerderquelle`, `Ausschreibung`, `ScanLauf`, `User`, `AuditLog`, `Einstellung` samt Enums (exakte Feldnamen siehe Schema unten – alle späteren Tasks bauen darauf).

- [ ] **Step 1: Ordner + Dev-DB anlegen**

`foerderungen/docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16
    container_name: foerderungen-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: foerderungen
      POSTGRES_PASSWORD: foerderungen_dev_passwort
      POSTGRES_DB: foerderungen
    ports:
      - "5435:5432"
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
```

`foerderungen/backend/.gitignore`:

```
node_modules/
dist/
.env
```

Zusätzlich `postgres-data/` ausschließen – neue Datei `foerderungen/.gitignore`:

```
postgres-data/
```

Starten und Test-DB anlegen:

```powershell
cd foerderungen; docker compose up -d db; cd backend
# kurz warten, bis Postgres bereit ist, dann:
docker exec foerderungen-db psql -U foerderungen -c "CREATE DATABASE foerderungen_test;"
```

- [ ] **Step 2: package.json / tsconfig / vitest.config**

`foerderungen/backend/package.json`:

```json
{
  "name": "foerderungen-backend",
  "version": "0.1.0",
  "description": "Backend fuer das Foerderungen-Tool OEHTB",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "seed": "tsx prisma/seed.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.2",
    "express-async-errors": "^3.1.1",
    "helmet": "^8.3.0",
    "jsonwebtoken": "^9.0.2",
    "node-cron": "^3.0.3",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.8",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.10.2",
    "@types/node-cron": "^3.0.11",
    "@types/supertest": "^7.2.1",
    "cross-env": "^10.1.0",
    "prisma": "^5.22.0",
    "supertest": "^7.2.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^4.1.10"
  }
}
```

`foerderungen/backend/tsconfig.json`: **byte-identisch kopieren** aus `stunden/backend/tsconfig.json`.

`foerderungen/backend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Laeuft vor jeder Testdatei: setzt NODE_ENV/Secrets und leitet – falls
    // TEST_DATABASE_URL gesetzt ist – die DB-Verbindung auf die Testdatenbank um.
    setupFiles: ["./src/test/setup.ts"],
    // Integrationstests teilen sich eine DB; parallele Worker wuerden sich
    // gegenseitig die Daten loeschen. Daher seriell.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
```

`foerderungen/backend/.env.example`:

```
# ==== Datenbank ====
DATABASE_URL="postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen"

# ==== Server ====
PORT=3003

# ==== Auth / SSO ====
# WICHTIG: identischer Wert im Suite-Portal und ALLEN Tools (gemeinsames SSO)!
JWT_SECRET="bitte-in-produktion-aendern-langer-zufallswert"
SESSION_TIMEOUT_MINUTEN=15

# ==== Suite-Integration ====
TOOL_SLUG="foerderungen"
# Interne URL des Suite-Portals (fuer Rechte-Refresh). In Docker: http://portal-app:3000
SUITE_URL="http://localhost:3000"
# Gemeinsames Provisionierungs-Geheimnis (identisch mit dem Portal).
PROVISION_SECRET="dev-provision-secret"

# ==== Verschluesselung fuer gespeicherte API-Keys (at rest) ====
# Genau 32 Zeichen (256 Bit). In Produktion aendern!
ENCRYPTION_KEY="bitte32zeichenlangerschluessel!!"

# ==== Frontend-URL (CORS) ====
FRONTEND_URL="http://localhost:5176"
```

Dann `.env` aus `.env.example` kopieren und `npm install` ausführen.

- [ ] **Step 3: Prisma-Schema schreiben**

`foerderungen/backend/prisma/schema.prisma`:

```prisma
// Prisma-Schema fuer das Foerderungen-Tool OEHTB
// Datenmodell siehe docs/superpowers/specs/2026-07-16-foerderungen-design.md

generator client {
  provider = "prisma-client-js"
  // Windows ARM64 + Produktions-Container: Muster stunden/backend/prisma/schema.prisma
  engineType    = "binary"
  binaryTargets = ["native", "windows", "debian-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------------------------------------------------------------------------
// Die Foerderlandschaft (stabil): Foerdergeber/Programme
// ---------------------------------------------------------------------------
model Foerderquelle {
  id           String        @id @default(cuid())
  name         String
  traeger      String
  ebene        Ebene
  kategorie    Kategorie
  themen       String[]      @default([])
  beschreibung String        @default("")
  webseite     String?
  kontakt      String?
  status       QuelleStatus  @default(AKTIV)
  quelleTyp    Herkunft      @default(MANUELL)
  erstelltAm   DateTime      @default(now())
  geaendertAm  DateTime      @default(now()) @updatedAt

  ausschreibungen Ausschreibung[]

  @@index([status])
}

enum Ebene {
  BUND
  LAND
  GEMEINDE
  EU
  PRIVAT
}

enum Kategorie {
  PROJEKT
  KERNGESCHAEFT
  BEIDES
}

// ARCHIVIERT dient auch als Tombstone fuer abgelehnte Scanner-Vorschlaege,
// damit der naechste Scan denselben Fund nicht erneut vorschlaegt.
enum QuelleStatus {
  AKTIV
  VORGESCHLAGEN
  ARCHIVIERT
}

enum Herkunft {
  MANUELL
  SCAN
}

// ---------------------------------------------------------------------------
// Zeitkritisch: konkrete Ausschreibungen/Calls mit Fristen
// ---------------------------------------------------------------------------
model Ausschreibung {
  id                 String              @id @default(cuid())
  foerderquelle      Foerderquelle       @relation(fields: [foerderquelleId], references: [id], onDelete: Cascade)
  foerderquelleId    String
  titel              String
  beschreibung       String              @default("")
  link               String?
  // Normalisierte Fassung des Links (Kleinschreibung, ohne Protokoll/Tracking)
  // fuer den Dedup-Abgleich des Scanners.
  linkNormalisiert   String?
  frist              DateTime?           @db.Date
  laufendEinreichbar Boolean             @default(false)
  foerderhoehe       String?
  status             AusschreibungStatus @default(OFFEN)
  quelleTyp          Herkunft            @default(MANUELL)
  erstelltAm         DateTime            @default(now())
  geaendertAm        DateTime            @default(now()) @updatedAt

  // Aktualisierungsvorschlag des Scanners: verweist auf die Bestandszeile,
  // deren Felder (z. B. Frist) sich geaendert haben. "Uebernehmen" uebertraegt
  // die Felder auf die Bestandszeile und loescht den Vorschlag.
  aktualisiertAusschreibungId String?
  aktualisiertAusschreibung   Ausschreibung?  @relation("Aktualisierung", fields: [aktualisiertAusschreibungId], references: [id], onDelete: Cascade)
  aktualisierungsVorschlaege  Ausschreibung[] @relation("Aktualisierung")

  @@index([status, frist])
  @@index([linkNormalisiert])
  @@index([foerderquelleId])
}

// ABGELEHNT bleibt gespeichert (Tombstone), damit der Scanner denselben Fund
// nicht erneut vorschlaegt.
enum AusschreibungStatus {
  OFFEN
  VORGESCHLAGEN
  ABGELAUFEN
  ABGELEHNT
}

// ---------------------------------------------------------------------------
// Protokoll der Scan-Laeufe
// ---------------------------------------------------------------------------
model ScanLauf {
  id        String        @id @default(cuid())
  gestartet DateTime      @default(now())
  beendet   DateTime?
  ausloeser ScanAusloeser
  statistik Json?
  fehler    String?

  @@index([gestartet])
}

enum ScanAusloeser {
  ZEITPLAN
  MANUELL
}

// ---------------------------------------------------------------------------
// Tool-Benutzer (Spiegel der Suite, Auto-Provisioning) – Muster: stunden
// ---------------------------------------------------------------------------
model User {
  id           String    @id @default(cuid())
  email        String?   @unique
  suiteUserId  String?   @unique
  name         String?
  rolle        Rolle     @default(NUTZER)
  aktiv        Boolean   @default(true)
  geloescht    Boolean   @default(false)
  letzterLogin DateTime?
  erstelltAm   DateTime  @default(now())
}

enum Rolle {
  NUTZER
}

// ---------------------------------------------------------------------------
// AuditLog – Tabelle heisst suiteweit einheitlich "audit_log"
// ---------------------------------------------------------------------------
model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  aktion    String
  zeitpunkt DateTime @default(now())
  details   Json?

  @@index([zeitpunkt])
  @@map("audit_log")
}

// ---------------------------------------------------------------------------
// Konfiguration (Key-Value): llm_konfig, scan_konfig
// ---------------------------------------------------------------------------
model Einstellung {
  id          String   @id @default(cuid())
  schluessel  String   @unique
  wert        Json
  geaendertAm DateTime @default(now()) @updatedAt
}
```

Migration erzeugen: `npx prisma migrate dev --name init` (aus `foerderungen/backend/`, Dev-DB muss laufen).

- [ ] **Step 4: prisma.ts und Test-Setup**

`foerderungen/backend/src/lib/prisma.ts`: **byte-identisch kopieren** aus `stunden/backend/src/lib/prisma.ts`.

`foerderungen/backend/src/test/setup.ts`:

```ts
// Vitest-Setup (laeuft VOR den Testdateien, bevor lib/prisma.ts den Client mit
// DATABASE_URL erzeugt). Stellt den Testbetrieb sicher. Muster: stunden.

process.env.NODE_ENV = "test";

process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-secret-nur-fuer-integrationstests-min-32-zeichen";
process.env.PROVISION_SECRET =
  process.env.PROVISION_SECRET || "test-provision-secret-min-16-zeichen";
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "testschluessel-genau-32-zeichen!";

// DB-Verbindung NUR auf die ausdruecklich gesetzte Testdatenbank umleiten.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
```

WICHTIG: `ENCRYPTION_KEY`-Testwert muss **genau 32 Zeichen** haben – `"testschluessel-genau-32-zeichen!"` hat exakt 32. Vor dem Festschreiben nachzählen.

- [ ] **Step 5: Fehlschlagenden Test für den Health-Endpunkt schreiben**

`foerderungen/backend/src/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./index";

describe("GET /api/health", () => {
  it("antwortet mit status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
```

Run: `npx vitest run src/index.test.ts`
Expected: FAIL (Cannot find module './index' bzw. app nicht exportiert)

- [ ] **Step 6: index.ts implementieren**

`foerderungen/backend/src/index.ts` – Muster `stunden/backend/src/index.ts`, reduziert auf das, was es hier schon gibt (Routen/Zeitplan kommen in späteren Tasks dazu):

```ts
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
```

- [ ] **Step 7: Test grün laufen lassen**

Run: `npx vitest run src/index.test.ts`
Expected: PASS (1 Test)

- [ ] **Step 8: Commit**

```bash
git add foerderungen/
git commit -m "Foerderungen: Backend-Grundgeruest (App, Prisma-Schema, Health)"
```

---

### Task 2: SSO-Auth, Sitzung und Provisionierung

**Files:**
- Create: `foerderungen/backend/src/lib/suiteAuth.ts`, `src/lib/krypto.ts`, `src/lib/audit.ts`, `src/lib/provision.ts`
- Create: `foerderungen/backend/src/middleware/auth.ts`
- Create: `foerderungen/backend/src/routes/sitzung.ts`, `src/routes/provision.ts`
- Create: `foerderungen/backend/src/test/helfer.ts`
- Modify: `foerderungen/backend/src/index.ts` (Routen einhängen, Startchecks)
- Test: `foerderungen/backend/src/routes/provision.integration.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), Prisma-Modelle `User`, `AuditLog`.
- Produces: `authPflicht` (Express-Middleware, setzt `req.benutzer: { userId: string; rolle: "NUTZER"; letzteAktivitaet: number }`), `AuthRequest`-Typ, `verschluesseln/entschluesseln(text: string): string`, `auditLog({ userId?, aktion, details? })`, Test-Helfer `resetDb()`, `anmeldeCookie(app): Promise<string[]>` (liefert Cookie-Header eines provisionierten Test-Nutzers).

- [ ] **Step 1: Bibliotheks-Dateien kopieren/anpassen**

1. `src/lib/suiteAuth.ts`: kopieren aus `stunden/backend/src/lib/suiteAuth.ts`, **eine Änderung**: `TOOL_SLUG = process.env.TOOL_SLUG ?? "foerderungen"`.
2. `src/lib/krypto.ts`: **byte-identisch kopieren** aus `stunden/backend/src/lib/krypto.ts`.
3. `src/lib/audit.ts`: kopieren aus `stunden/backend/src/lib/audit.ts`, dabei den Parameter `betroffenerMitarbeiterId` ersatzlos entfernen (Signatur: `{ userId?, aktion, details? }`).
4. `src/lib/provision.ts`: kopieren aus `stunden/backend/src/lib/provision.ts`, Rollenliste ersetzen:

```ts
const FQ_ROLLEN = ["nutzer"] as const;
type FqRolle = (typeof FQ_ROLLEN)[number];
```

und in `applyUpsert` die Zeilen zur Rollenableitung ersetzen durch:

```ts
  const gueltig = FQ_ROLLEN.includes((p.rolle ?? "") as FqRolle);
  // Einzige Tool-Rolle ist NUTZER; ohne gueltige Rolle -> gesperrt.
  const rolle = "NUTZER" as const;
  const aktiv = p.aktiv && gueltig;
```

(Der Rest – upsert/delete/reconcile – bleibt unverändert; `rolle` wird wie gehabt in `prisma.user.create/update` geschrieben.)

- [ ] **Step 2: Auth-Middleware**

`src/middleware/auth.ts`: kopieren aus `stunden/backend/src/middleware/auth.ts` mit diesen Änderungen:

```ts
export type Rolle = "NUTZER";
const GUELTIGE_ROLLEN = ["nutzer"]; // Wert im Suite-Token (Registry-Schreibweise)
```

und die Rollenprüfung/Zuweisung:

```ts
  const rolleRoh = inhalt.zugriff[TOOL_SLUG];
  if (!rolleRoh || !GUELTIGE_ROLLEN.includes(rolleRoh)) {
    res.status(403).json({ fehler: "Kein Zugriff auf dieses Tool." });
    return;
  }
```

`lokalenBenutzerSichern` erhält keine Rolle mehr als Parameter (es gibt nur `NUTZER`, den Default des Schemas); `req.benutzer = { userId: lokaleId, rolle: "NUTZER", letzteAktivitaet: Date.now() }`. `rollePflicht` ersatzlos streichen (eine Rolle).

- [ ] **Step 3: Routen sitzung + provision**

`src/routes/sitzung.ts`: **byte-identisch kopieren** aus `stunden/backend/src/routes/sitzung.ts` (Pfad `/me`, nutzt `authPflicht`).

`src/routes/provision.ts`: **byte-identisch kopieren** aus `stunden/backend/src/routes/provision.ts`.

- [ ] **Step 4: index.ts erweitern**

In `src/index.ts` ergänzen (Importe oben, Verwendung an den markierten Stellen des stunden-Musters):

```ts
import { sitzungRouter } from "./routes/sitzung";
import { provisionRouter } from "./routes/provision";
import { reconcileVonSuite, provisionSecret } from "./lib/provision";
import { jwtSecret } from "./lib/suiteAuth";

// Nach den Importen, vor "export const app" (fail-fast wie stunden):
jwtSecret();
provisionSecret();
if (process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE === "1") {
  console.warn(
    "WARNUNG: COOKIE_INSECURE=1 – Session-Cookies werden ohne 'secure'-Flag gesetzt (nur hinter TLS/Tailscale vertretbar)."
  );
}

// Bei den Routen (nach /api/health):
app.use("/api/auth", sitzungRouter);
app.use("/api/provision", provisionRouter);

// Im listen-Callback ergänzen:
void reconcileVonSuite();
```

- [ ] **Step 5: Test-Helfer**

`foerderungen/backend/src/test/helfer.ts`:

```ts
import request from "supertest";
import type { Express } from "express";
import { prisma } from "../lib/prisma";

// Von setup.ts gesetzt; hier fuer die Tests zugaenglich gemacht.
export const PROVISION_SECRET = process.env.PROVISION_SECRET as string;

// Leert alle Tabellen (Integrationstests teilen sich die Test-DB).
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE audit_log, "Ausschreibung", "Foerderquelle", "ScanLauf",
      "User", "Einstellung"
    RESTART IDENTITY CASCADE;
  `);
}

// Provisioniert einen Test-Nutzer und liefert einen gueltigen suite_token-
// Cookie-Header (signiert mit dem Test-JWT_SECRET) fuer authentifizierte Calls.
export async function anmeldeCookie(app: Express): Promise<string[]> {
  await request(app)
    .put("/api/provision/user")
    .set("X-Provision-Secret", PROVISION_SECRET)
    .send({
      suiteUserId: "suite-test-1",
      benutzername: "test",
      name: "Test Nutzer",
      email: null,
      aktiv: true,
      rolle: "nutzer",
    })
    .expect(200);

  const jwt = await import("jsonwebtoken");
  const token = jwt.default.sign(
    {
      sub: "suite-test-1",
      benutzername: "test",
      name: "Test Nutzer",
      zugriff: { foerderungen: "nutzer" },
      letzteAktivitaet: Date.now(),
      geprueftAm: Date.now(),
    },
    process.env.JWT_SECRET as string,
    { expiresIn: "12h" }
  );
  return [`suite_token=${token}`];
}
```

- [ ] **Step 6: Fehlschlagenden Integrationstest schreiben**

`foerderungen/backend/src/routes/provision.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { resetDb, anmeldeCookie, PROVISION_SECRET } from "../test/helfer";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("Provisionierung & SSO", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lehnt Provisionierung ohne Secret ab", async () => {
    const res = await request(app).put("/api/provision/user").send({});
    expect(res.status).toBe(401);
  });

  it("legt Nutzer an und /api/auth/me liefert ihn", async () => {
    const cookie = await anmeldeCookie(app);
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.name).toBe("Test Nutzer");
    expect(me.body.rolle).toBe("NUTZER");
  });

  it("sperrt Nutzer ohne Tool-Rolle", async () => {
    await request(app)
      .put("/api/provision/user")
      .set("X-Provision-Secret", PROVISION_SECRET)
      .send({
        suiteUserId: "suite-test-2",
        benutzername: "ohne",
        name: "Ohne Zugriff",
        email: null,
        aktiv: true,
        rolle: null,
      })
      .expect(200);
    const u = await prisma.user.findUnique({ where: { suiteUserId: "suite-test-2" } });
    expect(u?.aktiv).toBe(false);
  });

  it("Tombstone: DELETE sperrt, loescht nicht", async () => {
    await anmeldeCookie(app);
    await request(app)
      .delete("/api/provision/user/suite-test-1")
      .set("X-Provision-Secret", PROVISION_SECRET)
      .expect(200);
    const u = await prisma.user.findUnique({ where: { suiteUserId: "suite-test-1" } });
    expect(u?.geloescht).toBe(true);
    expect(u?.aktiv).toBe(false);
  });
});
```

Run: `npx cross-env TEST_DATABASE_URL=postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen_test vitest run src/routes/provision.integration.test.ts`
Expected: FAIL (Module ./routes/sitzung etc. fehlen noch, falls Steps in anderer Reihenfolge; nach Implementierung aller Steps 1–5: PASS)

WICHTIG: Vor dem ersten Testlauf das Schema in die Test-DB migrieren:
`npx cross-env DATABASE_URL=postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen_test prisma migrate deploy`

- [ ] **Step 7: Tests grün laufen lassen**

Run: Kommando aus Step 6.
Expected: PASS (4 Tests)

- [ ] **Step 8: Commit**

```bash
git add foerderungen/backend
git commit -m "Foerderungen: SSO-Middleware, Sitzung und User-Provisionierung"
```

---

### Task 3: Routen Foerderquellen (CRUD + Freigeben/Ablehnen)

**Files:**
- Create: `foerderungen/backend/src/routes/quellen.ts`
- Modify: `foerderungen/backend/src/index.ts` (Router einhängen)
- Test: `foerderungen/backend/src/routes/quellen.integration.test.ts`

**Interfaces:**
- Consumes: `authPflicht`, `AuthRequest` (Task 2), `prisma`, `auditLog`.
- Produces: REST-Endpunkte `GET/POST /api/quellen`, `PATCH /api/quellen/:id`. Antwortform einer Quelle = Prisma-Objekt inkl. `_count.ausschreibungen` bei GET-Liste.

- [ ] **Step 1: Fehlschlagenden Integrationstest schreiben**

`foerderungen/backend/src/routes/quellen.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { resetDb, anmeldeCookie } from "../test/helfer";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("Foerderquellen-Routen", () => {
  let cookie: string[];

  beforeEach(async () => {
    await resetDb();
    cookie = await anmeldeCookie(app);
  });

  it("verlangt Anmeldung", async () => {
    const res = await request(app).get("/api/quellen");
    expect(res.status).toBe(401);
  });

  it("legt eine Quelle an und listet sie", async () => {
    const neu = await request(app).post("/api/quellen").set("Cookie", cookie).send({
      name: "FSW – Tagesstruktur",
      traeger: "Fonds Soziales Wien",
      ebene: "LAND",
      kategorie: "KERNGESCHAEFT",
      themen: ["Behindertenhilfe"],
      beschreibung: "Leistungsfinanzierung Tagesstruktur",
      webseite: "https://www.fsw.at",
    });
    expect(neu.status).toBe(201);
    expect(neu.body.status).toBe("AKTIV");

    const liste = await request(app).get("/api/quellen").set("Cookie", cookie);
    expect(liste.status).toBe(200);
    expect(liste.body).toHaveLength(1);
    expect(liste.body[0].name).toBe("FSW – Tagesstruktur");
  });

  it("filtert nach status und ebene", async () => {
    await prisma.foerderquelle.createMany({
      data: [
        { name: "A", traeger: "T", ebene: "BUND", kategorie: "PROJEKT" },
        { name: "B", traeger: "T", ebene: "EU", kategorie: "PROJEKT", status: "VORGESCHLAGEN" },
      ],
    });
    const nurBund = await request(app)
      .get("/api/quellen?ebene=BUND")
      .set("Cookie", cookie);
    expect(nurBund.body).toHaveLength(1);
    const nurVorschlag = await request(app)
      .get("/api/quellen?status=VORGESCHLAGEN")
      .set("Cookie", cookie);
    expect(nurVorschlag.body).toHaveLength(1);
    expect(nurVorschlag.body[0].name).toBe("B");
  });

  it("Freigeben: PATCH status VORGESCHLAGEN -> AKTIV", async () => {
    const q = await prisma.foerderquelle.create({
      data: { name: "Neu", traeger: "T", ebene: "PRIVAT", kategorie: "BEIDES", status: "VORGESCHLAGEN", quelleTyp: "SCAN" },
    });
    const res = await request(app)
      .patch(`/api/quellen/${q.id}`)
      .set("Cookie", cookie)
      .send({ status: "AKTIV" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("AKTIV");
  });

  it("weist ungueltige Nutzlast ab", async () => {
    const res = await request(app).post("/api/quellen").set("Cookie", cookie).send({
      name: "", traeger: "T", ebene: "FALSCH", kategorie: "PROJEKT",
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Test rot laufen lassen**

Run: `npx cross-env TEST_DATABASE_URL=postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen_test vitest run src/routes/quellen.integration.test.ts`
Expected: FAIL (404 statt 200/201 – Router existiert nicht)

- [ ] **Step 3: Router implementieren**

`foerderungen/backend/src/routes/quellen.ts`:

```ts
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auditLog } from "../lib/audit";
import { AuthRequest, authPflicht } from "../middleware/auth";

// Foerderquellen: die stabile Foerderlandschaft. Scanner-Vorschlaege sind
// Zeilen im Status VORGESCHLAGEN; Freigeben/Ablehnen ist ein Statuswechsel
// (AKTIV bzw. ARCHIVIERT als Tombstone) via PATCH.
export const quellenRouter = Router();
quellenRouter.use(authPflicht);

const EBENEN = ["BUND", "LAND", "GEMEINDE", "EU", "PRIVAT"] as const;
const KATEGORIEN = ["PROJEKT", "KERNGESCHAEFT", "BEIDES"] as const;
const STATUS = ["AKTIV", "VORGESCHLAGEN", "ARCHIVIERT"] as const;

const anlegenSchema = z.object({
  name: z.string().min(1).max(300),
  traeger: z.string().min(1).max(300),
  ebene: z.enum(EBENEN),
  kategorie: z.enum(KATEGORIEN),
  themen: z.array(z.string().min(1).max(100)).max(20).optional(),
  beschreibung: z.string().max(5000).optional(),
  webseite: z.string().url().max(1000).optional().or(z.literal("").transform(() => undefined)),
  kontakt: z.string().max(500).optional(),
});

const aendernSchema = anlegenSchema.partial().extend({
  status: z.enum(STATUS).optional(),
});

quellenRouter.get("/", async (req: AuthRequest, res: Response) => {
  const { status, ebene, kategorie, thema } = req.query as Record<string, string>;
  const quellen = await prisma.foerderquelle.findMany({
    where: {
      ...(status && STATUS.includes(status as (typeof STATUS)[number]) ? { status: status as (typeof STATUS)[number] } : {}),
      ...(ebene && EBENEN.includes(ebene as (typeof EBENEN)[number]) ? { ebene: ebene as (typeof EBENEN)[number] } : {}),
      ...(kategorie && KATEGORIEN.includes(kategorie as (typeof KATEGORIEN)[number]) ? { kategorie: kategorie as (typeof KATEGORIEN)[number] } : {}),
      ...(thema ? { themen: { has: thema } } : {}),
    },
    orderBy: [{ name: "asc" }],
    include: { _count: { select: { ausschreibungen: true } } },
  });
  res.json(quellen);
});

quellenRouter.get("/:id", async (req: AuthRequest, res: Response) => {
  const quelle = await prisma.foerderquelle.findUnique({
    where: { id: req.params.id },
    include: { ausschreibungen: { orderBy: [{ frist: "asc" }] } },
  });
  if (!quelle) {
    res.status(404).json({ fehler: "Foerderquelle nicht gefunden." });
    return;
  }
  res.json(quelle);
});

quellenRouter.post("/", async (req: AuthRequest, res: Response) => {
  const parse = anlegenSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const quelle = await prisma.foerderquelle.create({
    data: { ...parse.data, themen: parse.data.themen ?? [] },
  });
  await auditLog({
    userId: req.benutzer!.userId,
    aktion: "QUELLE_ANGELEGT",
    details: { quelleId: quelle.id, name: quelle.name },
  });
  res.status(201).json(quelle);
});

quellenRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  const parse = aendernSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const vorhanden = await prisma.foerderquelle.findUnique({ where: { id: req.params.id } });
  if (!vorhanden) {
    res.status(404).json({ fehler: "Foerderquelle nicht gefunden." });
    return;
  }
  const quelle = await prisma.foerderquelle.update({
    where: { id: vorhanden.id },
    data: parse.data,
  });
  await auditLog({
    userId: req.benutzer!.userId,
    aktion: parse.data.status && parse.data.status !== vorhanden.status
      ? `QUELLE_STATUS_${parse.data.status}`
      : "QUELLE_GEAENDERT",
    details: { quelleId: quelle.id, name: quelle.name },
  });
  res.json(quelle);
});
```

In `src/index.ts` einhängen: `import { quellenRouter } from "./routes/quellen";` und `app.use("/api/quellen", quellenRouter);` (nach `/api/auth`).

- [ ] **Step 4: Test grün laufen lassen**

Run: Kommando aus Step 2.
Expected: PASS (5 Tests)

- [ ] **Step 5: Commit**

```bash
git add foerderungen/backend
git commit -m "Foerderungen: Foerderquellen-Routen (CRUD, Freigabe per Statuswechsel)"
```

---

### Task 4: Routen Ausschreibungen (CRUD, Prüf-Ablauf, Aktualisierungsvorschlag, Fristablauf)

**Files:**
- Create: `foerderungen/backend/src/routes/ausschreibungen.ts`
- Create: `foerderungen/backend/src/services/fristen.ts`
- Modify: `foerderungen/backend/src/index.ts` (Router einhängen)
- Test: `foerderungen/backend/src/routes/ausschreibungen.integration.test.ts`, `foerderungen/backend/src/services/fristen.integration.test.ts`

**Interfaces:**
- Consumes: `authPflicht`, `prisma`, `auditLog`.
- Produces: `GET/POST /api/ausschreibungen`, `PATCH /api/ausschreibungen/:id` (inkl. Übernehmen eines Aktualisierungsvorschlags), `markiereAbgelaufene(): Promise<number>` (setzt OFFEN mit Frist < heute auf ABGELAUFEN, liefert Anzahl). GET-Liste liefert Ausschreibungen inkl. `foerderquelle` (Objekt) und bei Vorschlägen `aktualisiertAusschreibung`.

- [ ] **Step 1: Fehlschlagenden Test für Fristablauf schreiben**

`foerderungen/backend/src/services/fristen.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/prisma";
import { resetDb } from "../test/helfer";
import { markiereAbgelaufene } from "./fristen";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("markiereAbgelaufene", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("setzt nur OFFENE mit vergangener Frist auf ABGELAUFEN", async () => {
    const q = await prisma.foerderquelle.create({
      data: { name: "Q", traeger: "T", ebene: "BUND", kategorie: "PROJEKT" },
    });
    const gestern = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.ausschreibung.createMany({
      data: [
        { foerderquelleId: q.id, titel: "alt-offen", frist: gestern, status: "OFFEN" },
        { foerderquelleId: q.id, titel: "frisch", frist: morgen, status: "OFFEN" },
        { foerderquelleId: q.id, titel: "laufend", laufendEinreichbar: true, status: "OFFEN" },
        { foerderquelleId: q.id, titel: "alt-vorschlag", frist: gestern, status: "VORGESCHLAGEN" },
      ],
    });

    const anzahl = await markiereAbgelaufene();
    expect(anzahl).toBe(1);

    const abgelaufen = await prisma.ausschreibung.findMany({ where: { status: "ABGELAUFEN" } });
    expect(abgelaufen).toHaveLength(1);
    expect(abgelaufen[0].titel).toBe("alt-offen");
  });
});
```

Run: `npx cross-env TEST_DATABASE_URL=postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen_test vitest run src/services/fristen.integration.test.ts`
Expected: FAIL (Modul ./fristen fehlt)

- [ ] **Step 2: fristen.ts implementieren**

`foerderungen/backend/src/services/fristen.ts`:

```ts
import { prisma } from "../lib/prisma";

// Setzt offene Ausschreibungen mit ueberschrittener Frist auf ABGELAUFEN.
// Wird naechtlich vom Zeitplan (services/zeitplan.ts) und zu Beginn jedes
// Scans aufgerufen. Vorschlaege bleiben unberuehrt – sie werden im Pruef-
// Schritt entschieden.
export async function markiereAbgelaufene(): Promise<number> {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const ergebnis = await prisma.ausschreibung.updateMany({
    where: {
      status: "OFFEN",
      laufendEinreichbar: false,
      frist: { not: null, lt: heute },
    },
    data: { status: "ABGELAUFEN" },
  });
  return ergebnis.count;
}
```

- [ ] **Step 3: Fristen-Test grün laufen lassen**

Run: Kommando aus Step 1.
Expected: PASS (1 Test)

- [ ] **Step 4: Fehlschlagenden Test für Ausschreibungs-Routen schreiben**

`foerderungen/backend/src/routes/ausschreibungen.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { resetDb, anmeldeCookie } from "../test/helfer";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("Ausschreibungs-Routen", () => {
  let cookie: string[];
  let quelleId: string;

  beforeEach(async () => {
    await resetDb();
    cookie = await anmeldeCookie(app);
    const q = await prisma.foerderquelle.create({
      data: { name: "Q", traeger: "T", ebene: "BUND", kategorie: "PROJEKT" },
    });
    quelleId = q.id;
  });

  it("legt eine Ausschreibung an und listet sie mit Quelle", async () => {
    const neu = await request(app).post("/api/ausschreibungen").set("Cookie", cookie).send({
      foerderquelleId: quelleId,
      titel: "Digitalisierungs-Call 2026",
      frist: "2026-10-31",
      foerderhoehe: "bis 50.000 EUR",
      link: "https://beispiel.at/call",
    });
    expect(neu.status).toBe(201);

    const liste = await request(app).get("/api/ausschreibungen").set("Cookie", cookie);
    expect(liste.body).toHaveLength(1);
    expect(liste.body[0].foerderquelle.name).toBe("Q");
  });

  it("Pruef-Ablauf: VORGESCHLAGEN -> OFFEN und -> ABGELEHNT", async () => {
    const a = await prisma.ausschreibung.create({
      data: { foerderquelleId: quelleId, titel: "Vorschlag", status: "VORGESCHLAGEN", quelleTyp: "SCAN" },
    });
    const frei = await request(app)
      .patch(`/api/ausschreibungen/${a.id}`)
      .set("Cookie", cookie)
      .send({ status: "OFFEN" });
    expect(frei.body.status).toBe("OFFEN");

    const b = await prisma.ausschreibung.create({
      data: { foerderquelleId: quelleId, titel: "Vorschlag 2", status: "VORGESCHLAGEN", quelleTyp: "SCAN" },
    });
    const abgelehnt = await request(app)
      .patch(`/api/ausschreibungen/${b.id}`)
      .set("Cookie", cookie)
      .send({ status: "ABGELEHNT" });
    expect(abgelehnt.body.status).toBe("ABGELEHNT");
  });

  it("Aktualisierungsvorschlag uebernehmen: Felder wandern, Vorschlag verschwindet", async () => {
    const original = await prisma.ausschreibung.create({
      data: {
        foerderquelleId: quelleId,
        titel: "Call",
        frist: new Date("2026-09-30"),
        status: "OFFEN",
      },
    });
    const vorschlag = await prisma.ausschreibung.create({
      data: {
        foerderquelleId: quelleId,
        titel: "Call",
        frist: new Date("2026-11-30"),
        status: "VORGESCHLAGEN",
        quelleTyp: "SCAN",
        aktualisiertAusschreibungId: original.id,
      },
    });

    const res = await request(app)
      .patch(`/api/ausschreibungen/${vorschlag.id}`)
      .set("Cookie", cookie)
      .send({ status: "OFFEN" });
    expect(res.status).toBe(200);
    // Antwort ist die AKTUALISIERTE Bestandszeile.
    expect(res.body.id).toBe(original.id);
    expect(res.body.frist.startsWith("2026-11-30")).toBe(true);

    const nochDa = await prisma.ausschreibung.findUnique({ where: { id: vorschlag.id } });
    expect(nochDa).toBeNull();
  });

  it("weist ungueltige Quelle ab", async () => {
    const res = await request(app).post("/api/ausschreibungen").set("Cookie", cookie).send({
      foerderquelleId: "gibt-es-nicht",
      titel: "X",
    });
    expect(res.status).toBe(400);
  });
});
```

Run: `npx cross-env TEST_DATABASE_URL=postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen_test vitest run src/routes/ausschreibungen.integration.test.ts`
Expected: FAIL (404 – Router fehlt)

- [ ] **Step 5: Router implementieren**

`foerderungen/backend/src/routes/ausschreibungen.ts`:

```ts
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auditLog } from "../lib/audit";
import { AuthRequest, authPflicht } from "../middleware/auth";
import { normalisiereLink } from "../services/scanner";

// Ausschreibungen: der zeitkritische Teil. Scanner-Vorschlaege sind Zeilen im
// Status VORGESCHLAGEN. Sonderfall Aktualisierungsvorschlag (siehe Spec):
// PATCH auf status=OFFEN uebertraegt die Felder auf die Bestandszeile und
// loescht den Vorschlag.
export const ausschreibungenRouter = Router();
ausschreibungenRouter.use(authPflicht);

const STATUS = ["OFFEN", "VORGESCHLAGEN", "ABGELAUFEN", "ABGELEHNT"] as const;

const anlegenSchema = z.object({
  foerderquelleId: z.string().min(1),
  titel: z.string().min(1).max(500),
  beschreibung: z.string().max(5000).optional(),
  link: z.string().url().max(1000).optional().or(z.literal("").transform(() => undefined)),
  frist: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  laufendEinreichbar: z.boolean().optional(),
  foerderhoehe: z.string().max(500).optional(),
});

const aendernSchema = anlegenSchema.partial().extend({
  status: z.enum(STATUS).optional(),
  frist: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

function fristAlsDatum(frist: string | null | undefined): Date | null | undefined {
  if (frist === undefined) return undefined;
  return frist === null ? null : new Date(frist + "T00:00:00.000Z");
}

ausschreibungenRouter.get("/", async (req: AuthRequest, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const liste = await prisma.ausschreibung.findMany({
    where: status && STATUS.includes(status as (typeof STATUS)[number])
      ? { status: status as (typeof STATUS)[number] }
      : {},
    orderBy: [{ frist: { sort: "asc", nulls: "last" } }, { titel: "asc" }],
    include: { foerderquelle: true, aktualisiertAusschreibung: true },
  });
  res.json(liste);
});

ausschreibungenRouter.post("/", async (req: AuthRequest, res: Response) => {
  const parse = anlegenSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const quelle = await prisma.foerderquelle.findUnique({
    where: { id: parse.data.foerderquelleId },
  });
  if (!quelle) {
    res.status(400).json({ fehler: "Foerderquelle nicht gefunden." });
    return;
  }
  const a = await prisma.ausschreibung.create({
    data: {
      ...parse.data,
      frist: fristAlsDatum(parse.data.frist),
      linkNormalisiert: parse.data.link ? normalisiereLink(parse.data.link) : null,
    },
    include: { foerderquelle: true },
  });
  await auditLog({
    userId: req.benutzer!.userId,
    aktion: "AUSSCHREIBUNG_ANGELEGT",
    details: { ausschreibungId: a.id, titel: a.titel },
  });
  res.status(201).json(a);
});

ausschreibungenRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  const parse = aendernSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const vorhanden = await prisma.ausschreibung.findUnique({ where: { id: req.params.id } });
  if (!vorhanden) {
    res.status(404).json({ fehler: "Ausschreibung nicht gefunden." });
    return;
  }

  // Sonderfall: Aktualisierungsvorschlag wird uebernommen -> Felder auf die
  // Bestandszeile uebertragen, Vorschlag loeschen, Bestandszeile antworten.
  if (
    parse.data.status === "OFFEN" &&
    vorhanden.status === "VORGESCHLAGEN" &&
    vorhanden.aktualisiertAusschreibungId
  ) {
    const [aktualisiert] = await prisma.$transaction([
      prisma.ausschreibung.update({
        where: { id: vorhanden.aktualisiertAusschreibungId },
        data: {
          titel: vorhanden.titel,
          beschreibung: vorhanden.beschreibung,
          link: vorhanden.link,
          linkNormalisiert: vorhanden.linkNormalisiert,
          frist: vorhanden.frist,
          laufendEinreichbar: vorhanden.laufendEinreichbar,
          foerderhoehe: vorhanden.foerderhoehe,
          status: "OFFEN",
        },
        include: { foerderquelle: true },
      }),
      prisma.ausschreibung.delete({ where: { id: vorhanden.id } }),
    ]);
    await auditLog({
      userId: req.benutzer!.userId,
      aktion: "AUSSCHREIBUNG_AKTUALISIERUNG_UEBERNOMMEN",
      details: { ausschreibungId: aktualisiert.id, titel: aktualisiert.titel },
    });
    res.json(aktualisiert);
    return;
  }

  const daten: Record<string, unknown> = { ...parse.data };
  if ("frist" in parse.data) daten.frist = fristAlsDatum(parse.data.frist);
  if (parse.data.link !== undefined) {
    daten.linkNormalisiert = parse.data.link ? normalisiereLink(parse.data.link) : null;
  }
  const a = await prisma.ausschreibung.update({
    where: { id: vorhanden.id },
    data: daten,
    include: { foerderquelle: true },
  });
  await auditLog({
    userId: req.benutzer!.userId,
    aktion: parse.data.status && parse.data.status !== vorhanden.status
      ? `AUSSCHREIBUNG_STATUS_${parse.data.status}`
      : "AUSSCHREIBUNG_GEAENDERT",
    details: { ausschreibungId: a.id, titel: a.titel },
  });
  res.json(a);
});
```

Hinweis: `normalisiereLink` kommt aus `services/scanner.ts` – die Datei entsteht in Task 6. Damit dieser Task eigenständig grün wird, JETZT eine minimale `foerderungen/backend/src/services/scanner.ts` anlegen, die Task 6 dann erweitert:

```ts
// Link-Normalisierung fuer den Dedup-Abgleich (Kleinschreibung, ohne
// Protokoll/www/Tracking-Parameter/abschliessenden Slash).
export function normalisiereLink(roh: string): string {
  try {
    const url = new URL(roh);
    const params = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (!/^(utm_|fbclid|gclid)/i.test(k)) params.append(k, v);
    }
    const query = params.toString();
    return (
      url.hostname.toLowerCase().replace(/^www\./, "") +
      url.pathname.replace(/\/+$/, "").toLowerCase() +
      (query ? "?" + query : "")
    );
  } catch {
    return roh.trim().toLowerCase();
  }
}
```

In `src/index.ts` einhängen: `app.use("/api/ausschreibungen", ausschreibungenRouter);`

- [ ] **Step 6: Tests grün laufen lassen**

Run: `npx cross-env TEST_DATABASE_URL=postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen_test vitest run src/routes/ausschreibungen.integration.test.ts src/services/fristen.integration.test.ts`
Expected: PASS (5 Tests)

- [ ] **Step 7: Commit**

```bash
git add foerderungen/backend
git commit -m "Foerderungen: Ausschreibungs-Routen, Pruef-Ablauf und Fristablauf"
```

---

### Task 5: Einstellungs-Routen (LLM-Konfiguration + Scan-Zeitplan)

**Files:**
- Create: `foerderungen/backend/src/lib/konstanten.ts`
- Create: `foerderungen/backend/src/routes/einstellungen.ts`
- Modify: `foerderungen/backend/src/index.ts` (Router einhängen)
- Test: `foerderungen/backend/src/routes/einstellungen.integration.test.ts`

**Interfaces:**
- Consumes: `authPflicht`, `prisma`, `verschluesseln` (Task 2), `auditLog`.
- Produces: `GET /api/einstellungen` → `{ llm: { provider, modell, apiKeyGesetzt }, scan: { aktiv, wochentag, stunde } }`; `PUT /api/einstellungen/llm` (Body `{ provider, modell?, apiKey? }`); `PUT /api/einstellungen/scan` (Body `{ aktiv, wochentag, stunde }`). Einstellungs-Schlüssel: `llm_konfig` (Wert `{ provider, modell, apiKeyVerschluesselt }`), `scan_konfig` (Wert `{ aktiv, wochentag, stunde }`). Konstanten-Exporte aus `src/lib/konstanten.ts` (NICHT aus der Route – vermeidet Import-Zyklen mit zeitplan/factory): `LLM_SCHLUESSEL`, `SCAN_SCHLUESSEL`, `SCAN_STANDARD = { aktiv: false, wochentag: 1, stunde: 6 }`.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`foerderungen/backend/src/routes/einstellungen.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { entschluesseln } from "../lib/krypto";
import { resetDb, anmeldeCookie } from "../test/helfer";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("Einstellungs-Routen", () => {
  let cookie: string[];

  beforeEach(async () => {
    await resetDb();
    cookie = await anmeldeCookie(app);
  });

  it("liefert Standardwerte ohne gespeicherte Konfiguration", async () => {
    const res = await request(app).get("/api/einstellungen").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.llm.provider).toBe("dummy");
    expect(res.body.llm.apiKeyGesetzt).toBe(false);
    expect(res.body.scan).toEqual({ aktiv: false, wochentag: 1, stunde: 6 });
  });

  it("speichert LLM-Konfiguration, Key verschluesselt und nie im Klartext zurueck", async () => {
    const put = await request(app).put("/api/einstellungen/llm").set("Cookie", cookie).send({
      provider: "anthropic",
      modell: "claude-sonnet-4-6",
      apiKey: "sk-test-geheim",
    });
    expect(put.status).toBe(200);

    const res = await request(app).get("/api/einstellungen").set("Cookie", cookie);
    expect(res.body.llm.provider).toBe("anthropic");
    expect(res.body.llm.apiKeyGesetzt).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("sk-test-geheim");

    const zeile = await prisma.einstellung.findUnique({ where: { schluessel: "llm_konfig" } });
    const wert = zeile!.wert as { apiKeyVerschluesselt: string };
    expect(wert.apiKeyVerschluesselt).not.toContain("sk-test-geheim");
    expect(entschluesseln(wert.apiKeyVerschluesselt)).toBe("sk-test-geheim");
  });

  it("behaelt gespeicherten Key, wenn beim Speichern kein neuer uebergeben wird", async () => {
    await request(app).put("/api/einstellungen/llm").set("Cookie", cookie).send({
      provider: "anthropic", apiKey: "sk-test-geheim",
    });
    await request(app).put("/api/einstellungen/llm").set("Cookie", cookie).send({
      provider: "anthropic", modell: "claude-opus-4-8",
    });
    const zeile = await prisma.einstellung.findUnique({ where: { schluessel: "llm_konfig" } });
    const wert = zeile!.wert as { apiKeyVerschluesselt: string; modell: string };
    expect(entschluesseln(wert.apiKeyVerschluesselt)).toBe("sk-test-geheim");
    expect(wert.modell).toBe("claude-opus-4-8");
  });

  it("speichert Scan-Zeitplan und validiert Grenzen", async () => {
    const ok = await request(app).put("/api/einstellungen/scan").set("Cookie", cookie).send({
      aktiv: true, wochentag: 1, stunde: 6,
    });
    expect(ok.status).toBe(200);
    const schlecht = await request(app).put("/api/einstellungen/scan").set("Cookie", cookie).send({
      aktiv: true, wochentag: 9, stunde: 6,
    });
    expect(schlecht.status).toBe(400);
  });
});
```

Run: `npx cross-env TEST_DATABASE_URL=postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen_test vitest run src/routes/einstellungen.integration.test.ts`
Expected: FAIL (404)

- [ ] **Step 2: Konstanten + Router implementieren**

`foerderungen/backend/src/lib/konstanten.ts` (eigene Datei, damit Route, Zeitplan und LLM-Factory sie ohne Import-Zyklus teilen):

```ts
// Schluessel der Einstellung-Tabelle + Standardwerte.
export const LLM_SCHLUESSEL = "llm_konfig";
export const SCAN_SCHLUESSEL = "scan_konfig";
// wochentag: 0 = Sonntag … 6 = Samstag (cron-Konvention); Standard Montag 06:00.
export const SCAN_STANDARD = { aktiv: false, wochentag: 1, stunde: 6 };
```

`foerderungen/backend/src/routes/einstellungen.ts`:

```ts
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { verschluesseln } from "../lib/krypto";
import { auditLog } from "../lib/audit";
import { LLM_SCHLUESSEL, SCAN_SCHLUESSEL, SCAN_STANDARD } from "../lib/konstanten";
import { AuthRequest, authPflicht } from "../middleware/auth";
import { aktualisiereZeitplan } from "../services/zeitplan";

// Konfiguration nach dem Muster des Stunden-Admin-Tabs: Key-Value-Zeilen in
// der Einstellung-Tabelle, API-Key AES-verschluesselt at rest, nie im
// Klartext in einer Antwort.
export const einstellungenRouter = Router();
einstellungenRouter.use(authPflicht);

einstellungenRouter.get("/", async (_req: AuthRequest, res: Response) => {
  const [llm, scan] = await Promise.all([
    prisma.einstellung.findUnique({ where: { schluessel: LLM_SCHLUESSEL } }),
    prisma.einstellung.findUnique({ where: { schluessel: SCAN_SCHLUESSEL } }),
  ]);
  const llmWert = (llm?.wert as Record<string, unknown>) ?? {};
  const scanWert = (scan?.wert as Record<string, unknown>) ?? {};
  res.json({
    llm: {
      provider: llmWert.provider ?? "dummy",
      modell: llmWert.modell ?? "",
      apiKeyGesetzt: Boolean(llmWert.apiKeyVerschluesselt),
    },
    scan: {
      aktiv: typeof scanWert.aktiv === "boolean" ? scanWert.aktiv : SCAN_STANDARD.aktiv,
      wochentag: typeof scanWert.wochentag === "number" ? scanWert.wochentag : SCAN_STANDARD.wochentag,
      stunde: typeof scanWert.stunde === "number" ? scanWert.stunde : SCAN_STANDARD.stunde,
    },
  });
});

const llmSchema = z.object({
  provider: z.enum(["anthropic", "openai", "dummy"]),
  modell: z.string().max(100).optional(),
  apiKey: z.string().max(500).optional(),
});

einstellungenRouter.put("/llm", async (req: AuthRequest, res: Response) => {
  const parse = llmSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  const d = parse.data;
  const alt = await prisma.einstellung.findUnique({ where: { schluessel: LLM_SCHLUESSEL } });
  const alterWert = (alt?.wert as Record<string, unknown>) ?? {};
  const neuerWert: Record<string, unknown> = {
    provider: d.provider,
    modell: d.modell ?? "",
    // Ohne neuen Key den gespeicherten behalten.
    apiKeyVerschluesselt: alterWert.apiKeyVerschluesselt ?? null,
  };
  if (d.apiKey && d.apiKey.trim().length > 0) {
    neuerWert.apiKeyVerschluesselt = verschluesseln(d.apiKey.trim());
  }
  await prisma.einstellung.upsert({
    where: { schluessel: LLM_SCHLUESSEL },
    update: { wert: neuerWert as object },
    create: { schluessel: LLM_SCHLUESSEL, wert: neuerWert as object },
  });
  await auditLog({
    userId: req.benutzer!.userId,
    aktion: "EINSTELLUNG_LLM",
    details: { provider: d.provider, modell: d.modell },
  });
  res.json({ ok: true });
});

const scanSchema = z.object({
  aktiv: z.boolean(),
  wochentag: z.number().int().min(0).max(6),
  stunde: z.number().int().min(0).max(23),
});

einstellungenRouter.put("/scan", async (req: AuthRequest, res: Response) => {
  const parse = scanSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ fehler: "Ungültige Eingabe." });
    return;
  }
  await prisma.einstellung.upsert({
    where: { schluessel: SCAN_SCHLUESSEL },
    update: { wert: parse.data },
    create: { schluessel: SCAN_SCHLUESSEL, wert: parse.data },
  });
  await auditLog({ userId: req.benutzer!.userId, aktion: "EINSTELLUNG_SCAN", details: parse.data });
  // Cron-Job an den neuen Zeitplan anpassen.
  await aktualisiereZeitplan();
  res.json({ ok: true });
});
```

Hinweis: `aktualisiereZeitplan` kommt aus `services/zeitplan.ts` (Task 7). Damit dieser Task eigenständig grün wird, JETZT eine minimale `foerderungen/backend/src/services/zeitplan.ts` anlegen, die Task 7 vollständig ersetzt:

```ts
// Platzhalter – vollstaendige Implementierung (node-cron) folgt mit dem Scanner.
export async function aktualisiereZeitplan(): Promise<void> {}
```

In `src/index.ts` einhängen: `app.use("/api/einstellungen", einstellungenRouter);`

- [ ] **Step 3: Tests grün laufen lassen**

Run: Kommando aus Step 1.
Expected: PASS (4 Tests)

- [ ] **Step 4: Commit**

```bash
git add foerderungen/backend
git commit -m "Foerderungen: Einstellungen (LLM-Provider, API-Key verschluesselt, Scan-Zeitplan)"
```

---

### Task 6: LLM-Provider-Schicht (typen, dummy, anthropic, openai, factory)

**Files:**
- Create: `foerderungen/backend/src/services/llm/typen.ts`, `dummy.ts`, `anthropic.ts`, `openai.ts`, `factory.ts`
- Test: `foerderungen/backend/src/services/llm/factory.test.ts` (reiner Unit-Test, keine DB nötig für Providerwahl-Logik → Factory so schneiden, dass die Konfig hereingereicht werden kann)

**Interfaces:**
- Consumes: `prisma`, `entschluesseln`, `LLM_SCHLUESSEL` (Task 5).
- Produces:
  - `ScanFund` = `{ quelleName: string; titel: string; link: string | null; frist: string | null; laufendEinreichbar: boolean; foerderhoehe: string | null; beschreibung: string }` (frist = ISO `YYYY-MM-DD`)
  - `QuellenFund` = `{ name: string; traeger: string; ebene: "BUND"|"LAND"|"GEMEINDE"|"EU"|"PRIVAT"; kategorie: "PROJEKT"|"KERNGESCHAEFT"|"BEIDES"; themen: string[]; beschreibung: string; webseite: string | null }`
  - `LLMProvider` = `{ name: string; sucheAusschreibungen(quellen: QuellenInfo[]): Promise<ScanFund[]>; entdeckeQuellen(bekannteNamen: string[]): Promise<QuellenFund[]> }` mit `QuellenInfo = { name: string; webseite: string | null; themen: string[] }`
  - `erzeugeProvider(konfig: ProviderKonfig): LLMProvider`, `ladeProviderKonfig(): Promise<ProviderKonfig>`, `extrahiereJsonArray<T>(text: string): T[]`

- [ ] **Step 1: typen.ts schreiben**

`foerderungen/backend/src/services/llm/typen.ts`:

```ts
// ---------------------------------------------------------------------------
// Gemeinsames Interface fuer alle LLM-Provider des Foerder-Scanners.
//
// Der Scanner braucht PROVIDERSEITIGE Websuche (das Modell durchsucht selbst
// das Web) – deshalb gibt es hier, anders als im Stunden-Tool, keinen
// Ollama-Provider: ein lokales Modell kann nicht ins Internet.
// ---------------------------------------------------------------------------

export interface QuellenInfo {
  name: string;
  webseite: string | null;
  themen: string[];
}

// Eine vom Scan gefundene Ausschreibung (Phase 1: Ueberwachung).
export interface ScanFund {
  quelleName: string; // Name der Foerderquelle, zu der der Fund gehoert
  titel: string;
  link: string | null;
  frist: string | null; // ISO YYYY-MM-DD, null = keine/laufende Frist
  laufendEinreichbar: boolean;
  foerderhoehe: string | null;
  beschreibung: string;
}

// Eine vom Scan entdeckte neue Foerderquelle (Phase 2: Entdeckung).
export interface QuellenFund {
  name: string;
  traeger: string;
  ebene: "BUND" | "LAND" | "GEMEINDE" | "EU" | "PRIVAT";
  kategorie: "PROJEKT" | "KERNGESCHAEFT" | "BEIDES";
  themen: string[];
  beschreibung: string;
  webseite: string | null;
}

export interface LLMProvider {
  name: string;
  sucheAusschreibungen(quellen: QuellenInfo[]): Promise<ScanFund[]>;
  entdeckeQuellen(bekannteNamen: string[]): Promise<QuellenFund[]>;
}

export interface ProviderKonfig {
  provider: "anthropic" | "openai" | "dummy";
  modell?: string;
  apiKey?: string;
}

// Profil der OEHTB fuer die Such-Prompts (Phase 1 + 2).
export const OEHTB_PROFIL =
  "Das OEHTB (Oesterreichisches Hilfswerk fuer Taubblinde und hochgradig " +
  "Hoer- und Sehbehinderte) betreibt Behindertenhilfe in Oesterreich, vor " +
  "allem Wien: Wohnhaeuser/Wohngemeinschaften, Werkstaetten/Tagesstruktur, " +
  "Beratung und Foerderung taubblinder sowie hoer- und sehbehinderter " +
  "Menschen. Relevant sind projektbezogene Foerderungen (z. B. " +
  "Digitalisierung, Bau/Sanierung, Inklusion, Assistenztechnologie) UND " +
  "Foerderungen des Kerngeschaefts (Leistungsfinanzierung Behindertenhilfe).";

// Heutiges Datum fuer Prompts (das Modell soll Fristen relativ dazu bewerten).
export function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Zieht das erste vollstaendige JSON-Array aus einer Modellantwort
// (Modelle umgeben JSON gern mit Text oder ```-Zaeunen).
export function extrahiereJsonArray<T>(text: string): T[] {
  const start = text.indexOf("[");
  const ende = text.lastIndexOf("]");
  if (start === -1 || ende === -1 || ende <= start) {
    throw new Error("Antwort enthaelt kein JSON-Array.");
  }
  return JSON.parse(text.slice(start, ende + 1)) as T[];
}
```

- [ ] **Step 2: Fehlschlagenden Unit-Test für extrahiereJsonArray + Factory schreiben**

`foerderungen/backend/src/services/llm/factory.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extrahiereJsonArray } from "./typen";
import { erzeugeProvider } from "./factory";

describe("extrahiereJsonArray", () => {
  it("zieht ein Array aus Text mit Zaeunen", () => {
    const text = 'Hier das Ergebnis:\n```json\n[{"titel":"A"}]\n```\nFertig.';
    expect(extrahiereJsonArray<{ titel: string }>(text)).toEqual([{ titel: "A" }]);
  });

  it("wirft bei fehlendem Array", () => {
    expect(() => extrahiereJsonArray("kein json")).toThrow();
  });
});

describe("erzeugeProvider", () => {
  it("faellt ohne API-Key auf dummy zurueck", () => {
    expect(erzeugeProvider({ provider: "anthropic" }).name).toBe("dummy");
    expect(erzeugeProvider({ provider: "openai" }).name).toBe("dummy");
  });

  it("liefert die konfigurierten Provider mit Key", () => {
    expect(erzeugeProvider({ provider: "anthropic", apiKey: "x" }).name).toBe("anthropic");
    expect(erzeugeProvider({ provider: "openai", apiKey: "x" }).name).toBe("openai");
    expect(erzeugeProvider({ provider: "dummy" }).name).toBe("dummy");
  });
});
```

Run: `npx vitest run src/services/llm/factory.test.ts`
Expected: FAIL (Module fehlen)

- [ ] **Step 3: dummy.ts implementieren**

`foerderungen/backend/src/services/llm/dummy.ts`:

```ts
import { LLMProvider, QuellenInfo, ScanFund, QuellenFund } from "./typen";

// Attrappe: deterministische Beispiel-Funde, damit Entwicklung, Tests und
// UI-Abnahme ohne API-Key funktionieren. Liefert pro Lauf genau einen
// Ausschreibungs-Fund je erster Quelle und einen Quellen-Vorschlag.
export class DummyProvider implements LLMProvider {
  name = "dummy";

  async sucheAusschreibungen(quellen: QuellenInfo[]): Promise<ScanFund[]> {
    if (quellen.length === 0) return [];
    const inDreissigTagen = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const frist = inDreissigTagen.toISOString().slice(0, 10);
    return [
      {
        quelleName: quellen[0].name,
        titel: `Beispiel-Ausschreibung (${quellen[0].name})`,
        link: "https://beispiel.at/dummy-call",
        frist,
        laufendEinreichbar: false,
        foerderhoehe: "bis 10.000 EUR",
        beschreibung:
          "Attrappen-Fund des Dummy-Providers (kein echtes Modell). Dient zum Testen des Pruef-Ablaufs.",
      },
    ];
  }

  async entdeckeQuellen(bekannteNamen: string[]): Promise<QuellenFund[]> {
    if (bekannteNamen.includes("Beispiel-Stiftung (Dummy)")) return [];
    return [
      {
        name: "Beispiel-Stiftung (Dummy)",
        traeger: "Beispiel-Stiftung",
        ebene: "PRIVAT",
        kategorie: "PROJEKT",
        themen: ["Behindertenhilfe"],
        beschreibung:
          "Attrappen-Vorschlag des Dummy-Providers (kein echtes Modell).",
        webseite: "https://beispiel.at/stiftung",
      },
    ];
  }
}
```

- [ ] **Step 4: anthropic.ts implementieren**

`foerderungen/backend/src/services/llm/anthropic.ts`:

```ts
import {
  LLMProvider,
  QuellenInfo,
  ScanFund,
  QuellenFund,
  OEHTB_PROFIL,
  heuteIso,
  extrahiereJsonArray,
} from "./typen";

// ---------------------------------------------------------------------------
// Anthropic-Provider (Claude) mit providerseitigem Web-Search-Tool.
// Direkter fetch auf die Messages-API, kein SDK (Muster: stunden).
// Kostendeckel: max_tokens + max_uses der Websuche sind fest begrenzt.
// ---------------------------------------------------------------------------

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const STANDARD_MODELL = "claude-sonnet-4-6";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private apiKey: string;
  private modell: string;

  constructor(apiKey: string, modell?: string) {
    this.apiKey = apiKey;
    this.modell = modell && modell.trim() ? modell.trim() : STANDARD_MODELL;
  }

  private async frage(system: string, frage: string): Promise<string> {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: this.modell,
        max_tokens: 4000,
        system,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
        messages: [{ role: "user", content: frage }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic-API-Fehler ${res.status}: ${text.slice(0, 300)}`);
    }
    const daten = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    // Letzter Textblock enthaelt die finale Antwort (davor Tool-Blocks).
    const textBloecke = daten.content.filter((b) => b.type === "text" && b.text);
    if (textBloecke.length === 0) throw new Error("Anthropic-Antwort ohne Text.");
    return textBloecke.map((b) => b.text).join("\n");
  }

  async sucheAusschreibungen(quellen: QuellenInfo[]): Promise<ScanFund[]> {
    const liste = quellen
      .map((q) => `- ${q.name} (${q.webseite ?? "keine Webseite"}; Themen: ${q.themen.join(", ") || "-"})`)
      .join("\n");
    const system =
      `${OEHTB_PROFIL}\nHeute ist ${heuteIso()}. Du recherchierst per Websuche ` +
      `aktuell offene Foerder-Ausschreibungen (Calls) der genannten Foerdergeber. ` +
      `Antworte AM ENDE ausschliesslich mit einem JSON-Array. Jedes Element: ` +
      `{"quelleName": string (exakt wie in der Liste), "titel": string, ` +
      `"link": string|null, "frist": "YYYY-MM-DD"|null, ` +
      `"laufendEinreichbar": boolean, "foerderhoehe": string|null, ` +
      `"beschreibung": string (1-3 Saetze, deutsch)}. ` +
      `Nur Ausschreibungen mit Frist heute oder spaeter bzw. laufender ` +
      `Einreichung. Keine erfundenen Links. Leeres Array [] wenn nichts gefunden.`;
    const frage = `Pruefe diese Foerdergeber auf aktuell offene Ausschreibungen:\n${liste}`;
    const text = await this.frage(system, frage);
    return extrahiereJsonArray<ScanFund>(text);
  }

  async entdeckeQuellen(bekannteNamen: string[]): Promise<QuellenFund[]> {
    const system =
      `${OEHTB_PROFIL}\nHeute ist ${heuteIso()}. Du suchst per Websuche nach ` +
      `Foerderquellen (oeffentlich: Bund/Land/Gemeinde/EU, und privat: ` +
      `Stiftungen, Spendenaktionen, Lotteriemittel), die fuer diese ` +
      `Organisation relevant sind und NICHT in der bekannten Liste stehen. ` +
      `Antworte AM ENDE ausschliesslich mit einem JSON-Array. Jedes Element: ` +
      `{"name": string, "traeger": string, ` +
      `"ebene": "BUND"|"LAND"|"GEMEINDE"|"EU"|"PRIVAT", ` +
      `"kategorie": "PROJEKT"|"KERNGESCHAEFT"|"BEIDES", ` +
      `"themen": string[], "beschreibung": string (1-3 Saetze, deutsch), ` +
      `"webseite": string|null}. Maximal 5 Vorschlaege, nur seriös belegbare ` +
      `Quellen. Leeres Array [] wenn nichts Neues.`;
    const frage =
      `Bereits bekannte Foerderquellen (NICHT erneut vorschlagen):\n` +
      bekannteNamen.map((n) => `- ${n}`).join("\n");
    const text = await this.frage(system, frage);
    return extrahiereJsonArray<QuellenFund>(text);
  }
}
```

- [ ] **Step 5: openai.ts implementieren**

`foerderungen/backend/src/services/llm/openai.ts`:

```ts
import {
  LLMProvider,
  QuellenInfo,
  ScanFund,
  QuellenFund,
  OEHTB_PROFIL,
  heuteIso,
  extrahiereJsonArray,
} from "./typen";

// ---------------------------------------------------------------------------
// OpenAI-Provider ueber die Responses-API mit web_search-Tool.
// Gleiche Prompts wie der Anthropic-Provider, anderes Transportformat.
// ---------------------------------------------------------------------------

const OPENAI_URL = "https://api.openai.com/v1/responses";
const STANDARD_MODELL = "gpt-4.1";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private apiKey: string;
  private modell: string;

  constructor(apiKey: string, modell?: string) {
    this.apiKey = apiKey;
    this.modell = modell && modell.trim() ? modell.trim() : STANDARD_MODELL;
  }

  private async frage(system: string, frage: string): Promise<string> {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modell,
        max_output_tokens: 4000,
        tools: [{ type: "web_search" }],
        instructions: system,
        input: frage,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAI-API-Fehler ${res.status}: ${text.slice(0, 300)}`);
    }
    const daten = (await res.json()) as {
      output?: Array<{
        type: string;
        content?: Array<{ type: string; text?: string }>;
      }>;
    };
    const texte: string[] = [];
    for (const block of daten.output ?? []) {
      if (block.type === "message") {
        for (const c of block.content ?? []) {
          if (c.type === "output_text" && c.text) texte.push(c.text);
        }
      }
    }
    if (texte.length === 0) throw new Error("OpenAI-Antwort ohne Text.");
    return texte.join("\n");
  }

  async sucheAusschreibungen(quellen: QuellenInfo[]): Promise<ScanFund[]> {
    const liste = quellen
      .map((q) => `- ${q.name} (${q.webseite ?? "keine Webseite"}; Themen: ${q.themen.join(", ") || "-"})`)
      .join("\n");
    const system =
      `${OEHTB_PROFIL}\nHeute ist ${heuteIso()}. Du recherchierst per Websuche ` +
      `aktuell offene Foerder-Ausschreibungen (Calls) der genannten Foerdergeber. ` +
      `Antworte AM ENDE ausschliesslich mit einem JSON-Array. Jedes Element: ` +
      `{"quelleName": string (exakt wie in der Liste), "titel": string, ` +
      `"link": string|null, "frist": "YYYY-MM-DD"|null, ` +
      `"laufendEinreichbar": boolean, "foerderhoehe": string|null, ` +
      `"beschreibung": string (1-3 Saetze, deutsch)}. ` +
      `Nur Ausschreibungen mit Frist heute oder spaeter bzw. laufender ` +
      `Einreichung. Keine erfundenen Links. Leeres Array [] wenn nichts gefunden.`;
    const text = await this.frage(system, `Pruefe diese Foerdergeber auf aktuell offene Ausschreibungen:\n${liste}`);
    return extrahiereJsonArray<ScanFund>(text);
  }

  async entdeckeQuellen(bekannteNamen: string[]): Promise<QuellenFund[]> {
    const system =
      `${OEHTB_PROFIL}\nHeute ist ${heuteIso()}. Du suchst per Websuche nach ` +
      `Foerderquellen (oeffentlich: Bund/Land/Gemeinde/EU, und privat: ` +
      `Stiftungen, Spendenaktionen, Lotteriemittel), die fuer diese ` +
      `Organisation relevant sind und NICHT in der bekannten Liste stehen. ` +
      `Antworte AM ENDE ausschliesslich mit einem JSON-Array. Jedes Element: ` +
      `{"name": string, "traeger": string, ` +
      `"ebene": "BUND"|"LAND"|"GEMEINDE"|"EU"|"PRIVAT", ` +
      `"kategorie": "PROJEKT"|"KERNGESCHAEFT"|"BEIDES", ` +
      `"themen": string[], "beschreibung": string (1-3 Saetze, deutsch), ` +
      `"webseite": string|null}. Maximal 5 Vorschlaege, nur seriös belegbare ` +
      `Quellen. Leeres Array [] wenn nichts Neues.`;
    const text = await this.frage(
      system,
      `Bereits bekannte Foerderquellen (NICHT erneut vorschlagen):\n` +
        bekannteNamen.map((n) => `- ${n}`).join("\n")
    );
    return extrahiereJsonArray<QuellenFund>(text);
  }
}
```

- [ ] **Step 6: factory.ts implementieren**

`foerderungen/backend/src/services/llm/factory.ts`:

```ts
import { prisma } from "../../lib/prisma";
import { entschluesseln } from "../../lib/krypto";
import { LLM_SCHLUESSEL } from "../../lib/konstanten";
import { LLMProvider, ProviderKonfig } from "./typen";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { DummyProvider } from "./dummy";

// Provider-Factory nach dem Stunden-Muster: liest die gespeicherte
// Konfiguration und faellt ohne gueltigen API-Key auf den Dummy zurueck.

const STANDARD: ProviderKonfig = { provider: "dummy" };

export async function ladeProviderKonfig(): Promise<ProviderKonfig> {
  const eintrag = await prisma.einstellung.findUnique({
    where: { schluessel: LLM_SCHLUESSEL },
  });
  if (!eintrag) return STANDARD;
  const wert = eintrag.wert as Record<string, unknown>;
  const konfig: ProviderKonfig = {
    provider: (wert.provider as ProviderKonfig["provider"]) ?? "dummy",
    modell: typeof wert.modell === "string" ? wert.modell : undefined,
  };
  if (typeof wert.apiKeyVerschluesselt === "string" && wert.apiKeyVerschluesselt) {
    try {
      konfig.apiKey = entschluesseln(wert.apiKeyVerschluesselt);
    } catch {
      konfig.apiKey = undefined;
    }
  }
  return konfig;
}

export function erzeugeProvider(konfig: ProviderKonfig): LLMProvider {
  switch (konfig.provider) {
    case "anthropic":
      if (!konfig.apiKey) return new DummyProvider();
      return new AnthropicProvider(konfig.apiKey, konfig.modell);
    case "openai":
      if (!konfig.apiKey) return new DummyProvider();
      return new OpenAIProvider(konfig.apiKey, konfig.modell);
    default:
      return new DummyProvider();
  }
}
```

- [ ] **Step 7: Tests grün laufen lassen**

Run: `npx vitest run src/services/llm/factory.test.ts`
Expected: PASS (4 Tests)

- [ ] **Step 8: Commit**

```bash
git add foerderungen/backend
git commit -m "Foerderungen: LLM-Provider (anthropic/openai/dummy) mit Websuche"
```

---

### Task 7: Scanner (Dedup + Orchestrierung), Zeitplan und Scan-Routen

**Files:**
- Modify: `foerderungen/backend/src/services/scanner.ts` (Minimalfassung aus Task 4 vervollständigen)
- Modify: `foerderungen/backend/src/services/zeitplan.ts` (Platzhalter aus Task 5 ersetzen)
- Create: `foerderungen/backend/src/routes/scans.ts`
- Modify: `foerderungen/backend/src/index.ts` (Router einhängen, Zeitplan starten)
- Test: `foerderungen/backend/src/services/scanner.test.ts` (Unit: normalisiereLink, namenAehnlich), `foerderungen/backend/src/services/scanner.integration.test.ts` (Scan-Lauf mit Dummy-Provider)

**Interfaces:**
- Consumes: `erzeugeProvider`, `ladeProviderKonfig`, `LLMProvider`, `ScanFund`, `QuellenFund` (Task 6), `markiereAbgelaufene` (Task 4), `SCAN_SCHLUESSEL`, `SCAN_STANDARD` (Task 5), `prisma`.
- Produces:
  - `normalisiereLink(roh: string): string` (bereits aus Task 4)
  - `namenAehnlich(a: string, b: string): boolean`
  - `fuehreScanAus(ausloeser: "ZEITPLAN" | "MANUELL"): Promise<void>` (wirft nie; schreibt ScanLauf)
  - `scanLaeuft(): boolean`
  - `starteZeitplan(): Promise<void>`, `aktualisiereZeitplan(): Promise<void>` (zeitplan.ts)
  - REST: `GET /api/scans` → `{ laeuft: boolean, laeufe: ScanLauf[] }` (neueste zuerst, max. 50), `POST /api/scans` → 202 `{ ok: true }` oder 409.

- [ ] **Step 1: Fehlschlagende Unit-Tests für Dedup-Helfer schreiben**

`foerderungen/backend/src/services/scanner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalisiereLink, namenAehnlich } from "./scanner";

describe("normalisiereLink", () => {
  it("entfernt Protokoll, www, Tracking und Slash am Ende", () => {
    expect(normalisiereLink("https://www.FSW.at/Calls/2026/?utm_source=x")).toBe(
      "fsw.at/calls/2026"
    );
    expect(normalisiereLink("http://fsw.at/calls/2026")).toBe("fsw.at/calls/2026");
  });

  it("behaelt inhaltliche Query-Parameter", () => {
    expect(normalisiereLink("https://beispiel.at/call?id=7&utm_medium=m")).toBe(
      "beispiel.at/call?id=7"
    );
  });

  it("faellt bei ungueltiger URL auf Trim+Kleinschreibung zurueck", () => {
    expect(normalisiereLink("  Kein-Link  ")).toBe("kein-link");
  });
});

describe("namenAehnlich", () => {
  it("erkennt gleiche Namen trotz Gross/Klein, Umlauten und Zusaetzen", () => {
    expect(namenAehnlich("FSW – Tagesstruktur", "fsw tagesstruktur")).toBe(true);
    expect(namenAehnlich("Licht ins Dunkel", "LICHT INS DUNKEL (ORF)")).toBe(true);
    expect(namenAehnlich("Fonds Soziales Wien", "Fonds Gesundes Oesterreich")).toBe(false);
  });
});
```

Run: `npx vitest run src/services/scanner.test.ts`
Expected: FAIL (`namenAehnlich` existiert nicht)

- [ ] **Step 2: scanner.ts vervollständigen**

`foerderungen/backend/src/services/scanner.ts` – die Datei aus Task 4 (mit `normalisiereLink`) um Folgendes ergänzen (vollständige Datei = `normalisiereLink` + dieser Code):

```ts
import { prisma } from "../lib/prisma";
import { erzeugeProvider, ladeProviderKonfig } from "./llm/factory";
import { QuellenInfo, ScanFund, QuellenFund } from "./llm/typen";
import { markiereAbgelaufene } from "./fristen";

// Unscharfer Namensvergleich fuer den Dedup-Abgleich: Kleinschreibung,
// Umlaute/Akzente vereinheitlichen, Satzzeichen raus; gleich oder enthalten.
export function namenAehnlich(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Hoechstens ein Scan gleichzeitig (Modul-Zustand; ein Node-Prozess).
let laeuft = false;
export function scanLaeuft(): boolean {
  return laeuft;
}

const BATCH_GROESSE = 5;

interface Statistik {
  ueberwachung: { geprueft: number; funde: number; neu: number; aktualisierungen: number; uebersprungen: number };
  entdeckung: { funde: number; neu: number; uebersprungen: number };
}

// Fuehrt einen vollstaendigen Scan-Lauf aus. Wirft nie: Fehler landen im
// ScanLauf-Eintrag ("fehler"), Bestandsdaten bleiben unberuehrt.
export async function fuehreScanAus(ausloeser: "ZEITPLAN" | "MANUELL"): Promise<void> {
  if (laeuft) return;
  laeuft = true;
  const lauf = await prisma.scanLauf.create({ data: { ausloeser } });
  const statistik: Statistik = {
    ueberwachung: { geprueft: 0, funde: 0, neu: 0, aktualisierungen: 0, uebersprungen: 0 },
    entdeckung: { funde: 0, neu: 0, uebersprungen: 0 },
  };
  const fehlerListe: string[] = [];

  try {
    // Vorab: abgelaufene Ausschreibungen markieren, damit der Abgleich
    // gegen den aktuellen Stand laeuft.
    await markiereAbgelaufene();

    const provider = erzeugeProvider(await ladeProviderKonfig());

    // ---- Phase 1: Ueberwachung bekannter Quellen (gebuendelt) --------------
    try {
      const quellen = await prisma.foerderquelle.findMany({
        where: { status: "AKTIV" },
        orderBy: { name: "asc" },
      });
      for (let i = 0; i < quellen.length; i += BATCH_GROESSE) {
        const batch = quellen.slice(i, i + BATCH_GROESSE);
        const infos: QuellenInfo[] = batch.map((q) => ({
          name: q.name,
          webseite: q.webseite,
          themen: q.themen,
        }));
        statistik.ueberwachung.geprueft += batch.length;
        const funde = await provider.sucheAusschreibungen(infos);
        statistik.ueberwachung.funde += funde.length;
        for (const fund of funde) {
          await verarbeiteAusschreibungsFund(fund, batch, statistik);
        }
      }
    } catch (err) {
      fehlerListe.push(`Ueberwachung: ${String(err instanceof Error ? err.message : err)}`);
    }

    // ---- Phase 2: Entdeckung neuer Quellen ---------------------------------
    try {
      const alle = await prisma.foerderquelle.findMany({ select: { name: true, status: true } });
      const funde = await provider.entdeckeQuellen(alle.map((q) => q.name));
      statistik.entdeckung.funde = funde.length;
      for (const fund of funde) {
        await verarbeiteQuellenFund(fund, alle.map((q) => q.name), statistik);
      }
    } catch (err) {
      fehlerListe.push(`Entdeckung: ${String(err instanceof Error ? err.message : err)}`);
    }
  } catch (err) {
    fehlerListe.push(String(err instanceof Error ? err.message : err));
  } finally {
    await prisma.scanLauf.update({
      where: { id: lauf.id },
      data: {
        beendet: new Date(),
        statistik: statistik as unknown as object,
        fehler: fehlerListe.length > 0 ? fehlerListe.join(" | ") : null,
      },
    }).catch((e) => console.error("ScanLauf konnte nicht abgeschlossen werden:", e));
    laeuft = false;
  }
}

// Ordnet einen Ausschreibungs-Fund seiner Quelle zu und schreibt ihn als
// Vorschlag (bzw. Aktualisierungsvorschlag), sofern kein Duplikat existiert.
async function verarbeiteAusschreibungsFund(
  fund: ScanFund,
  batch: Array<{ id: string; name: string }>,
  statistik: Statistik
): Promise<void> {
  const quelle = batch.find((q) => namenAehnlich(q.name, fund.quelleName));
  if (!quelle || !fund.titel) {
    statistik.ueberwachung.uebersprungen++;
    return;
  }
  const linkNorm = fund.link ? normalisiereLink(fund.link) : null;

  // Bestehende Zeile suchen: erst ueber den Link, sonst Titel je Quelle.
  const kandidaten = await prisma.ausschreibung.findMany({
    where: linkNorm
      ? { OR: [{ linkNormalisiert: linkNorm }, { foerderquelleId: quelle.id }] }
      : { foerderquelleId: quelle.id },
  });
  const vorhanden = kandidaten.find(
    (k) =>
      (linkNorm && k.linkNormalisiert === linkNorm) ||
      namenAehnlich(k.titel, fund.titel)
  );

  const fristNeu = fund.frist ? new Date(fund.frist + "T00:00:00.000Z") : null;

  if (!vorhanden) {
    await prisma.ausschreibung.create({
      data: {
        foerderquelleId: quelle.id,
        titel: fund.titel,
        beschreibung: fund.beschreibung ?? "",
        link: fund.link,
        linkNormalisiert: linkNorm,
        frist: fristNeu,
        laufendEinreichbar: Boolean(fund.laufendEinreichbar),
        foerderhoehe: fund.foerderhoehe,
        status: "VORGESCHLAGEN",
        quelleTyp: "SCAN",
      },
    });
    statistik.ueberwachung.neu++;
    return;
  }

  // Abgelehnt = Tombstone; Vorschlaege nicht doppeln.
  if (vorhanden.status === "ABGELEHNT" || vorhanden.status === "VORGESCHLAGEN") {
    statistik.ueberwachung.uebersprungen++;
    return;
  }

  // Bestandszeile mit geaenderter Frist -> Aktualisierungsvorschlag,
  // sofern nicht schon einer wartet.
  const fristAlt = vorhanden.frist ? vorhanden.frist.toISOString().slice(0, 10) : null;
  if (vorhanden.status === "OFFEN" && fristAlt !== (fund.frist ?? null)) {
    const wartetSchon = await prisma.ausschreibung.findFirst({
      where: { aktualisiertAusschreibungId: vorhanden.id, status: "VORGESCHLAGEN" },
    });
    if (wartetSchon) {
      statistik.ueberwachung.uebersprungen++;
      return;
    }
    await prisma.ausschreibung.create({
      data: {
        foerderquelleId: quelle.id,
        titel: fund.titel,
        beschreibung: fund.beschreibung ?? vorhanden.beschreibung,
        link: fund.link ?? vorhanden.link,
        linkNormalisiert: linkNorm ?? vorhanden.linkNormalisiert,
        frist: fristNeu,
        laufendEinreichbar: Boolean(fund.laufendEinreichbar),
        foerderhoehe: fund.foerderhoehe ?? vorhanden.foerderhoehe,
        status: "VORGESCHLAGEN",
        quelleTyp: "SCAN",
        aktualisiertAusschreibungId: vorhanden.id,
      },
    });
    statistik.ueberwachung.aktualisierungen++;
    return;
  }

  statistik.ueberwachung.uebersprungen++;
}

// Schreibt einen Quellen-Fund als Vorschlag, sofern der Name nicht schon
// (in beliebigem Status, inkl. ARCHIVIERT als Tombstone) existiert.
async function verarbeiteQuellenFund(
  fund: QuellenFund,
  bekannteNamen: string[],
  statistik: Statistik
): Promise<void> {
  const EBENEN = ["BUND", "LAND", "GEMEINDE", "EU", "PRIVAT"];
  const KATEGORIEN = ["PROJEKT", "KERNGESCHAEFT", "BEIDES"];
  if (
    !fund.name ||
    !EBENEN.includes(fund.ebene) ||
    !KATEGORIEN.includes(fund.kategorie) ||
    bekannteNamen.some((n) => namenAehnlich(n, fund.name))
  ) {
    statistik.entdeckung.uebersprungen++;
    return;
  }
  await prisma.foerderquelle.create({
    data: {
      name: fund.name,
      traeger: fund.traeger || fund.name,
      ebene: fund.ebene,
      kategorie: fund.kategorie,
      themen: Array.isArray(fund.themen) ? fund.themen.slice(0, 20) : [],
      beschreibung: fund.beschreibung ?? "",
      webseite: fund.webseite,
      status: "VORGESCHLAGEN",
      quelleTyp: "SCAN",
    },
  });
  statistik.entdeckung.neu++;
}
```

- [ ] **Step 3: Unit-Tests grün laufen lassen**

Run: `npx vitest run src/services/scanner.test.ts`
Expected: PASS (5 Tests)

- [ ] **Step 4: Fehlschlagenden Integrationstest für den Scan-Lauf schreiben**

`foerderungen/backend/src/services/scanner.integration.test.ts` (nutzt den Dummy-Provider – keine LLM-Konfiguration gespeichert = Dummy):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/prisma";
import { resetDb } from "../test/helfer";
import { fuehreScanAus } from "./scanner";

const laufend = process.env.TEST_DATABASE_URL ? describe : describe.skip;

laufend("fuehreScanAus (Dummy-Provider)", () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.foerderquelle.create({
      data: { name: "FSW", traeger: "Fonds Soziales Wien", ebene: "LAND", kategorie: "KERNGESCHAEFT" },
    });
  });

  it("legt Funde als VORGESCHLAGEN an und protokolliert den Lauf", async () => {
    await fuehreScanAus("MANUELL");

    const vorschlaege = await prisma.ausschreibung.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(vorschlaege).toHaveLength(1);
    expect(vorschlaege[0].quelleTyp).toBe("SCAN");

    const quellenVorschlaege = await prisma.foerderquelle.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(quellenVorschlaege).toHaveLength(1);
    expect(quellenVorschlaege[0].name).toBe("Beispiel-Stiftung (Dummy)");

    const laeufe = await prisma.scanLauf.findMany();
    expect(laeufe).toHaveLength(1);
    expect(laeufe[0].beendet).not.toBeNull();
    expect(laeufe[0].fehler).toBeNull();
  });

  it("schlaegt denselben Fund beim zweiten Lauf nicht erneut vor", async () => {
    await fuehreScanAus("MANUELL");
    await fuehreScanAus("MANUELL");
    const vorschlaege = await prisma.ausschreibung.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(vorschlaege).toHaveLength(1);
  });

  it("schlaegt Abgelehntes nicht erneut vor", async () => {
    await fuehreScanAus("MANUELL");
    await prisma.ausschreibung.updateMany({
      where: { status: "VORGESCHLAGEN" },
      data: { status: "ABGELEHNT" },
    });
    await fuehreScanAus("MANUELL");
    const vorschlaege = await prisma.ausschreibung.findMany({ where: { status: "VORGESCHLAGEN" } });
    expect(vorschlaege).toHaveLength(0);
  });
});
```

Run: `npx cross-env TEST_DATABASE_URL=postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen_test vitest run src/services/scanner.integration.test.ts`
Expected: PASS direkt, falls Step 2 vollständig war – rot nur bei Implementierungsfehlern. (Reihenfolge hier bewusst Implementierung → Integrationstest, weil der Testgegenstand die Gesamtorchestrierung ist.)

- [ ] **Step 5: zeitplan.ts implementieren (Platzhalter ersetzen)**

`foerderungen/backend/src/services/zeitplan.ts`:

```ts
import cron, { ScheduledTask } from "node-cron";
import { prisma } from "../lib/prisma";
import { fuehreScanAus } from "./scanner";
import { markiereAbgelaufene } from "./fristen";
import { SCAN_SCHLUESSEL, SCAN_STANDARD } from "../lib/konstanten";

// Zwei Cron-Jobs:
// 1. Naechtlich 00:15 – abgelaufene Fristen markieren (immer aktiv).
// 2. Scan gemaess scan_konfig (Wochentag + Stunde, nur wenn aktiv) –
//    wird bei jeder Einstellungs-Aenderung neu registriert.

let scanJob: ScheduledTask | null = null;
let fristenJob: ScheduledTask | null = null;

async function ladeScanKonfig(): Promise<{ aktiv: boolean; wochentag: number; stunde: number }> {
  const zeile = await prisma.einstellung.findUnique({ where: { schluessel: SCAN_SCHLUESSEL } });
  const wert = (zeile?.wert as Record<string, unknown>) ?? {};
  return {
    aktiv: typeof wert.aktiv === "boolean" ? wert.aktiv : SCAN_STANDARD.aktiv,
    wochentag: typeof wert.wochentag === "number" ? wert.wochentag : SCAN_STANDARD.wochentag,
    stunde: typeof wert.stunde === "number" ? wert.stunde : SCAN_STANDARD.stunde,
  };
}

export async function aktualisiereZeitplan(): Promise<void> {
  if (scanJob) {
    scanJob.stop();
    scanJob = null;
  }
  const konfig = await ladeScanKonfig();
  if (!konfig.aktiv) return;
  // "0 6 * * 1" = jeden Montag 06:00.
  scanJob = cron.schedule(`0 ${konfig.stunde} * * ${konfig.wochentag}`, () => {
    void fuehreScanAus("ZEITPLAN");
  });
}

export async function starteZeitplan(): Promise<void> {
  if (!fristenJob) {
    fristenJob = cron.schedule("15 0 * * *", () => {
      void markiereAbgelaufene().then((n) => {
        if (n > 0) console.log(`Fristablauf: ${n} Ausschreibung(en) auf ABGELAUFEN gesetzt.`);
      });
    });
  }
  await aktualisiereZeitplan();
}
```

- [ ] **Step 6: Scan-Routen + index.ts**

`foerderungen/backend/src/routes/scans.ts`:

```ts
import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { auditLog } from "../lib/audit";
import { AuthRequest, authPflicht } from "../middleware/auth";
import { fuehreScanAus, scanLaeuft } from "../services/scanner";

// Scan-Verlauf + manueller Start. Der Scan laeuft asynchron; die Antwort
// kommt sofort (202). Hoechstens ein Scan gleichzeitig (409).
export const scansRouter = Router();
scansRouter.use(authPflicht);

scansRouter.get("/", async (_req: AuthRequest, res: Response) => {
  const laeufe = await prisma.scanLauf.findMany({
    orderBy: { gestartet: "desc" },
    take: 50,
  });
  res.json({ laeuft: scanLaeuft(), laeufe });
});

scansRouter.post("/", async (req: AuthRequest, res: Response) => {
  if (scanLaeuft()) {
    res.status(409).json({ fehler: "Es läuft bereits ein Scan." });
    return;
  }
  await auditLog({ userId: req.benutzer!.userId, aktion: "SCAN_GESTARTET" });
  void fuehreScanAus("MANUELL");
  res.status(202).json({ ok: true });
});
```

In `src/index.ts`: `import { scansRouter } from "./routes/scans";`, `import { starteZeitplan } from "./services/zeitplan";`, dann `app.use("/api/scans", scansRouter);` und im listen-Callback nach `void reconcileVonSuite();` ergänzen: `void starteZeitplan();`

- [ ] **Step 7: Gesamte Test-Suite laufen lassen**

Run: `npx cross-env TEST_DATABASE_URL=postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen_test vitest run`
Expected: PASS (alle bisherigen Tests)

- [ ] **Step 8: Commit**

```bash
git add foerderungen/backend
git commit -m "Foerderungen: Scanner (Dedup, zwei Phasen), Zeitplan und Scan-Routen"
```

---

### Task 8: Seed-Daten (Initialkatalog der Förderlandschaft)

**Files:**
- Create: `foerderungen/backend/prisma/seed.ts`

**Interfaces:**
- Consumes: Prisma-Modell `Foerderquelle`.
- Produces: idempotenter Seed (upsert nach `name`) mit dem Initialkatalog.

- [ ] **Step 1: seed.ts schreiben**

Der Katalog ist der Rechercheausgangspunkt – Details (insb. Webseiten) prüft der erste echte Scan bzw. die Redaktion im Werkzeug. `foerderungen/backend/prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";

// Initialkatalog der oesterreichischen Foerderlandschaft fuer das OEHTB.
// Idempotent: Abgleich ueber den Namen; bestehende Zeilen werden NICHT
// ueberschrieben (Redaktion im Werkzeug hat Vorrang vor dem Seed).

const prisma = new PrismaClient();

type Eintrag = {
  name: string;
  traeger: string;
  ebene: "BUND" | "LAND" | "GEMEINDE" | "EU" | "PRIVAT";
  kategorie: "PROJEKT" | "KERNGESCHAEFT" | "BEIDES";
  themen: string[];
  beschreibung: string;
  webseite: string;
};

const KATALOG: Eintrag[] = [
  {
    name: "Fonds Soziales Wien (FSW)",
    traeger: "Stadt Wien",
    ebene: "LAND",
    kategorie: "KERNGESCHAEFT",
    themen: ["Behindertenhilfe", "Wohnen", "Tagesstruktur"],
    beschreibung:
      "Zentraler Kostentraeger der Wiener Behindertenhilfe: Leistungsfinanzierung fuer Wohnen, Tagesstruktur und Beratung anerkannter Traeger.",
    webseite: "https://www.fsw.at",
  },
  {
    name: "Sozialministeriumservice – NEBA / Ausgleichstaxfonds",
    traeger: "Bund (BMSGPK)",
    ebene: "BUND",
    kategorie: "BEIDES",
    themen: ["Behindertenhilfe", "Arbeitsmarkt", "Inklusion"],
    beschreibung:
      "Foerderungen zur beruflichen Teilhabe von Menschen mit Behinderung (NEBA-Leistungen, Zuschuesse, Projektfoerderungen aus dem Ausgleichstaxfonds).",
    webseite: "https://www.sozialministeriumservice.at",
  },
  {
    name: "Bundesministerium fuer Soziales (BMSGPK) – Projektfoerderungen",
    traeger: "Bund (BMSGPK)",
    ebene: "BUND",
    kategorie: "PROJEKT",
    themen: ["Behindertenhilfe", "Inklusion", "Soziales"],
    beschreibung:
      "Projektfoerderungen des Sozialministeriums, u. a. aus Mitteln des Unterstuetzungsfonds fuer Menschen mit Behinderung.",
    webseite: "https://www.sozialministerium.at",
  },
  {
    name: "ESF+ Oesterreich",
    traeger: "EU / BMAW-BMSGPK (Verwaltungsbehoerde)",
    ebene: "EU",
    kategorie: "PROJEKT",
    themen: ["Inklusion", "Arbeitsmarkt", "Armutsbekaempfung"],
    beschreibung:
      "Europaeischer Sozialfonds Plus: Calls fuer Projekte zu Beschaeftigung, Inklusion und sozialer Innovation in Oesterreich.",
    webseite: "https://www.esf.at",
  },
  {
    name: "Erasmus+ (OeAD)",
    traeger: "EU / OeAD",
    ebene: "EU",
    kategorie: "PROJEKT",
    themen: ["Bildung", "Inklusion", "Austausch"],
    beschreibung:
      "EU-Programm fuer Bildung und Jugend; Foerderschiene fuer inklusive Projekte und strategische Partnerschaften.",
    webseite: "https://erasmusplus.at",
  },
  {
    name: "EU4Health",
    traeger: "EU (HaDEA)",
    ebene: "EU",
    kategorie: "PROJEKT",
    themen: ["Gesundheit"],
    beschreibung:
      "EU-Gesundheitsprogramm mit Calls u. a. zu Versorgung, Praevention und vulnerablen Gruppen.",
    webseite: "https://hadea.ec.europa.eu",
  },
  {
    name: "FFG – Oesterreichische Forschungsfoerderungsgesellschaft",
    traeger: "Bund",
    ebene: "BUND",
    kategorie: "PROJEKT",
    themen: ["Digitalisierung", "Assistenztechnologie", "Innovation"],
    beschreibung:
      "Foerdert F&E- und Digitalisierungsprojekte (z. B. benefit/AAL-Nachfolgeprogramme, Digitalisierungs-Calls) – relevant fuer Assistenztechnologie.",
    webseite: "https://www.ffg.at",
  },
  {
    name: "aws – Austria Wirtschaftsservice",
    traeger: "Bund",
    ebene: "BUND",
    kategorie: "PROJEKT",
    themen: ["Digitalisierung", "Investitionen"],
    beschreibung:
      "Foerderbank des Bundes: Zuschuesse/Garantien fuer Investitions- und Digitalisierungsprojekte, teils auch fuer gemeinnuetzige Organisationen.",
    webseite: "https://www.aws.at",
  },
  {
    name: "Fonds Gesundes Oesterreich (FGOe)",
    traeger: "Bund (Gesundheit Oesterreich GmbH)",
    ebene: "BUND",
    kategorie: "PROJEKT",
    themen: ["Gesundheitsfoerderung", "Praevention"],
    beschreibung:
      "Projektfoerderungen der Gesundheitsfoerderung, auch fuer Zielgruppen mit Behinderung.",
    webseite: "https://fgoe.org",
  },
  {
    name: "OeNB Jubilaeumsfonds",
    traeger: "Oesterreichische Nationalbank",
    ebene: "BUND",
    kategorie: "PROJEKT",
    themen: ["Forschung"],
    beschreibung:
      "Foerdert wissenschaftliche Projekte, u. a. sozial- und gesundheitswissenschaftliche Begleitforschung.",
    webseite: "https://www.oenb.at",
  },
  {
    name: "Stadt Wien – MA 40 Soziales",
    traeger: "Stadt Wien",
    ebene: "GEMEINDE",
    kategorie: "BEIDES",
    themen: ["Soziales", "Behindertenhilfe"],
    beschreibung:
      "Foerderungen und Subventionen der Stadt Wien im Sozialbereich ausserhalb der FSW-Leistungsfinanzierung.",
    webseite: "https://www.wien.gv.at/gesundheit-soziales",
  },
  {
    name: "Land Niederoesterreich – Soziales",
    traeger: "Land Niederoesterreich",
    ebene: "LAND",
    kategorie: "BEIDES",
    themen: ["Behindertenhilfe", "Soziales"],
    beschreibung:
      "Foerderungen des Landes NOe fuer Behindertenhilfe und soziale Dienste (relevant fuer Standorte/Angebote ausserhalb Wiens).",
    webseite: "https://www.noe.gv.at",
  },
  {
    name: "Licht ins Dunkel",
    traeger: "Verein Licht ins Dunkel / ORF",
    ebene: "PRIVAT",
    kategorie: "PROJEKT",
    themen: ["Behindertenhilfe", "Soforthilfe", "Projekte"],
    beschreibung:
      "Oesterreichs groesste Spendenaktion; finanziert Projekte von Sozialorganisationen, Schwerpunkt Menschen mit Behinderung.",
    webseite: "https://lichtinsdunkel.org",
  },
  {
    name: "ERSTE Stiftung",
    traeger: "DIE ERSTE oesterreichische Spar-Casse Privatstiftung",
    ebene: "PRIVAT",
    kategorie: "PROJEKT",
    themen: ["Soziales", "Inklusion", "Zivilgesellschaft"],
    beschreibung:
      "Privatstiftung mit Programmen und Ausschreibungen im Sozialbereich (z. B. Auszeichnungen und Projektfoerderungen).",
    webseite: "https://www.erstestiftung.org",
  },
  {
    name: "Essl Foundation",
    traeger: "Essl Foundation",
    ebene: "PRIVAT",
    kategorie: "PROJEKT",
    themen: ["Behindertenhilfe", "Inklusion", "Innovation"],
    beschreibung:
      "Stiftung mit Fokus auf Menschen mit Behinderung (Zero Project); foerdert und praemiert inklusive Projekte.",
    webseite: "https://www.esslfoundation.org",
  },
];

async function main() {
  let neu = 0;
  for (const e of KATALOG) {
    const vorhanden = await prisma.foerderquelle.findFirst({ where: { name: e.name } });
    if (vorhanden) continue;
    await prisma.foerderquelle.create({ data: { ...e, status: "AKTIV", quelleTyp: "MANUELL" } });
    neu++;
  }
  console.log(`Seed: ${neu} von ${KATALOG.length} Foerderquellen neu angelegt.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Seed gegen die Dev-DB laufen lassen und Idempotenz prüfen**

Run: `npm run seed` (zweimal hintereinander)
Expected: erster Lauf `Seed: 15 von 15 …`, zweiter Lauf `Seed: 0 von 15 …`

- [ ] **Step 3: Commit**

```bash
git add foerderungen/backend/prisma/seed.ts
git commit -m "Foerderungen: Seed mit Initialkatalog der Foerderlandschaft"
```

---

### Task 9: Frontend-Grundgerüst (Vite, Tailwind, Auth, Layout, Routen)

**Files:**
- Create: `foerderungen/frontend/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `tailwind.config.js`, `postcss.config.js`
- Create: `foerderungen/frontend/src/main.tsx`, `index.css`, `App.tsx`
- Create: `foerderungen/frontend/src/lib/api.ts`, `lib/auth.tsx`, `lib/typen.ts`
- Create: `foerderungen/frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: Backend-Endpunkte `/api/auth/me`, `/api/ausschreibungen`, `/api/quellen` (für Badge).
- Produces: `api.get/post/put/patch<T>(pfad)`, `useAuth()` → `{ benutzer, laedt, abmelden }`, `Layout` (Prop `pruefBadge?: number` entfällt – Layout lädt den Badge selbst), Typen + Label-Konstanten aus `lib/typen.ts` (exakte Namen unten – alle Seiten-Tasks nutzen sie).

- [ ] **Step 1: Projektdateien anlegen**

`foerderungen/frontend/package.json` (wie stunden/frontend, eigener Name):

```json
{
  "name": "foerderungen-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.17",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^6.0.3"
  }
}
```

**Byte-identisch kopieren** aus `stunden/frontend/`: `tsconfig.json` (samt ggf. `tsconfig.node.json`, falls dort referenziert), `tailwind.config.js`, `postcss.config.js`, `src/index.css`, `src/vite-env.d.ts`.

`foerderungen/frontend/vite.config.ts` (Ports angepasst):

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: Unter dem Suite-Reverse-Proxy wird das Tool unter "/foerderungen/"
// ausgeliefert (per VITE_BASE beim Produktions-Build gesetzt).
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5176,
    proxy: {
      "/api": {
        target: "http://localhost:3003",
        changeOrigin: true,
      },
    },
  },
});
```

`foerderungen/frontend/index.html` (Muster stunden, Titel angepasst):

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ÖHTB Förderungen</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`foerderungen/frontend/src/main.tsx` (Muster stunden – BrowserRouter mit `basename` aus `import.meta.env.BASE_URL`; aus `stunden/frontend/src/main.tsx` kopieren und unverändert lassen).

Dann `npm install` in `foerderungen/frontend/`.

- [ ] **Step 2: lib/api.ts, lib/auth.tsx, lib/typen.ts**

`src/lib/api.ts`: **kopieren** aus `stunden/frontend/src/lib/api.ts` und um eine `patch`-Methode ergänzen (im `api`-Objekt):

```ts
  patch: <T>(pfad: string, body?: unknown) =>
    request<T>(pfad, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
```

`src/lib/auth.tsx`: **kopieren** aus `stunden/frontend/src/lib/auth.tsx`, Rolle vereinfachen: `export type Rolle = "NUTZER";` (Rest unverändert – Endpunkt `/api/auth/me`, Abmelden über `/api/suite/auth/logout`).

`src/lib/typen.ts`:

```ts
// Gemeinsame Typen + deutsche Beschriftungen fuer Enums (Spiegel des Backends).

export type Ebene = "BUND" | "LAND" | "GEMEINDE" | "EU" | "PRIVAT";
export type Kategorie = "PROJEKT" | "KERNGESCHAEFT" | "BEIDES";
export type QuelleStatus = "AKTIV" | "VORGESCHLAGEN" | "ARCHIVIERT";
export type AusschreibungStatus = "OFFEN" | "VORGESCHLAGEN" | "ABGELAUFEN" | "ABGELEHNT";

export interface Foerderquelle {
  id: string;
  name: string;
  traeger: string;
  ebene: Ebene;
  kategorie: Kategorie;
  themen: string[];
  beschreibung: string;
  webseite: string | null;
  kontakt: string | null;
  status: QuelleStatus;
  quelleTyp: "MANUELL" | "SCAN";
  ausschreibungen?: Ausschreibung[];
  _count?: { ausschreibungen: number };
}

export interface Ausschreibung {
  id: string;
  foerderquelleId: string;
  foerderquelle?: Foerderquelle;
  titel: string;
  beschreibung: string;
  link: string | null;
  frist: string | null; // ISO-Zeitstempel vom Backend
  laufendEinreichbar: boolean;
  foerderhoehe: string | null;
  status: AusschreibungStatus;
  quelleTyp: "MANUELL" | "SCAN";
  aktualisiertAusschreibungId: string | null;
  aktualisiertAusschreibung?: Ausschreibung | null;
}

export interface ScanLauf {
  id: string;
  gestartet: string;
  beendet: string | null;
  ausloeser: "ZEITPLAN" | "MANUELL";
  statistik: Record<string, Record<string, number>> | null;
  fehler: string | null;
}

export const EBENE_LABEL: Record<Ebene, string> = {
  BUND: "Bund",
  LAND: "Land",
  GEMEINDE: "Gemeinde",
  EU: "EU",
  PRIVAT: "Privat",
};

export const KATEGORIE_LABEL: Record<Kategorie, string> = {
  PROJEKT: "Projekt",
  KERNGESCHAEFT: "Kerngeschäft",
  BEIDES: "Projekt + Kerngeschäft",
};

// Frist formatieren (deutsches Datum) und Dringlichkeit ableiten.
export function fristText(a: Ausschreibung): string {
  if (a.laufendEinreichbar) return "laufend einreichbar";
  if (!a.frist) return "ohne Frist";
  return new Date(a.frist).toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function fristTage(a: Ausschreibung): number | null {
  if (!a.frist || a.laufendEinreichbar) return null;
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  return Math.round((new Date(a.frist).getTime() - heute.getTime()) / (24 * 60 * 60 * 1000));
}

// Tailwind-Klassen fuer die Dringlichkeit (Suite-Statusfarben).
export function fristKlasse(a: Ausschreibung): string {
  const tage = fristTage(a);
  if (tage === null) return "text-gray-600";
  if (tage < 7) return "text-gefahr-700 font-semibold";
  if (tage < 30) return "text-warnung-700 font-semibold";
  return "text-gray-700";
}
```

- [ ] **Step 3: Layout mit Prüf-Badge**

`src/components/Layout.tsx` (Muster stunden, Navigation dieses Tools, Badge lädt die Anzahl offener Vorschläge):

```tsx
import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Ausschreibung, Foerderquelle } from "../lib/typen";

// Gemeinsames Seitenlayout mit markanter Kopfleiste (Marken-Navy) und
// Navigation – einheitlich mit Portal, Handkassen und Stunden.
export default function Layout({ children }: { children: ReactNode }) {
  const { benutzer, abmelden } = useAuth();
  const ort = useLocation();
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    // Anzahl wartender Vorschlaege (Quellen + Ausschreibungen) fuer den Badge.
    Promise.all([
      api.get<Ausschreibung[]>("/api/ausschreibungen?status=VORGESCHLAGEN"),
      api.get<Foerderquelle[]>("/api/quellen?status=VORGESCHLAGEN"),
    ])
      .then(([a, q]) => setBadge(a.length + q.length))
      .catch(() => setBadge(0));
  }, [ort.pathname]);

  const navLink = (pfad: string, text: string, extra?: ReactNode) => {
    const aktiv = ort.pathname === pfad;
    return (
      <Link
        to={pfad}
        aria-current={aktiv ? "page" : undefined}
        className={
          "px-3 py-2 rounded-md text-sm font-medium inline-flex items-center gap-1.5 " +
          (aktiv ? "bg-marke-700 text-white" : "text-marke-100 hover:bg-marke-800")
        }
      >
        {text}
        {extra}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-marke-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight">ÖHTB</span>
            <span className="text-marke-300" aria-hidden="true">·</span>
            <span className="text-base font-medium text-marke-100">Förderungen</span>
          </div>
          <nav className="flex items-center gap-1 flex-wrap">
            <a
              href="/"
              className="px-3 py-2 rounded-md text-sm font-medium text-marke-100 hover:bg-marke-800"
            >
              ← Portal
            </a>
            {navLink("/", "Ausschreibungen")}
            {navLink("/landschaft", "Förderlandschaft")}
            {navLink(
              "/pruefen",
              "Prüfen",
              badge > 0 ? (
                <span className="rounded-full bg-warnung-600 text-white text-xs px-1.5 py-0.5 leading-none">
                  {badge}
                </span>
              ) : undefined
            )}
            {navLink("/scans", "Scans")}
            {navLink("/einstellungen", "Einstellungen")}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-marke-200">{benutzer?.name ?? benutzer?.email}</span>
            <button
              onClick={() => abmelden()}
              className="rounded-md bg-marke-800 px-3 py-1.5 font-medium hover:bg-marke-700"
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: App.tsx mit Routen**

`src/App.tsx` (Muster stunden; Seiten entstehen in Tasks 10–13 – bis dahin Platzhalter-Komponenten INLINE in App.tsx, die je Route nur `<Layout><h1 className="text-xl font-semibold">…</h1></Layout>` rendern; jede Seiten-Task ersetzt ihren Platzhalter durch den Import):

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import AusschreibungenSeite from "./pages/AusschreibungenSeite";
import LandschaftSeite from "./pages/LandschaftSeite";
import QuelleDetailSeite from "./pages/QuelleDetailSeite";
import PruefenSeite from "./pages/PruefenSeite";
import ScansSeite from "./pages/ScansSeite";
import EinstellungenSeite from "./pages/EinstellungenSeite";

// Keine Sitzung / kein Zugriff -> Hinweis mit Link ins Portal (Muster stunden).
function KeineSitzung() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold text-gray-800 mb-2">Förderungen ÖHTB</h1>
        <p className="text-sm text-gray-500 mb-6">
          Keine gültige Sitzung oder kein Zugriff auf dieses Tool. Bitte über das
          Portal anmelden.
        </p>
        <a
          href="/"
          className="inline-block bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700"
        >
          Zum Portal
        </a>
      </div>
    </div>
  );
}

function AppRouten() {
  const { benutzer, laedt } = useAuth();

  if (laedt) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Lädt …
      </div>
    );
  }
  if (!benutzer) return <KeineSitzung />;

  return (
    <Routes>
      <Route path="/" element={<AusschreibungenSeite />} />
      <Route path="/landschaft" element={<LandschaftSeite />} />
      <Route path="/landschaft/:id" element={<QuelleDetailSeite />} />
      <Route path="/pruefen" element={<PruefenSeite />} />
      <Route path="/scans" element={<ScansSeite />} />
      <Route path="/einstellungen" element={<EinstellungenSeite />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouten />
    </AuthProvider>
  );
}
```

Für diesen Task: die sechs Seiten-Dateien als minimale Platzhalter anlegen, z. B. `src/pages/AusschreibungenSeite.tsx`:

```tsx
import Layout from "../components/Layout";

export default function AusschreibungenSeite() {
  return (
    <Layout>
      <h1 className="text-xl font-semibold text-gray-800">Ausschreibungen</h1>
    </Layout>
  );
}
```

(analog `LandschaftSeite`, `QuelleDetailSeite`, `PruefenSeite`, `ScansSeite`, `EinstellungenSeite` – nur Überschrift angepasst).

- [ ] **Step 5: Build prüfen**

Run: `npm run build` (in `foerderungen/frontend/`)
Expected: tsc + vite build ohne Fehler

Zusätzlich Smoke-Test von Hand: Backend (`npm run dev` in backend/) + Frontend (`npm run dev` in frontend/) starten, Portal-Login auf :3000 durchführen (Suite-Backend muss laufen; Zugriff `foerderungen: nutzer` in der Verwaltung setzen – erfordert Task 14-Registry ODER vorübergehend manuell per SQL; alternativ reicht hier der Build-Check, der Smoke-Test folgt in Task 15).

- [ ] **Step 6: Commit**

```bash
git add foerderungen/frontend
git commit -m "Foerderungen: Frontend-Grundgeruest (Vite, Tailwind, Auth, Layout, Routen)"
```

---

### Task 10: Seite „Ausschreibungen" (Startseite mit Fristen und Filtern)

**Files:**
- Create (ersetzt Platzhalter): `foerderungen/frontend/src/pages/AusschreibungenSeite.tsx`

**Interfaces:**
- Consumes: `api`, `Layout`, Typen/Helfer aus `lib/typen.ts` (`fristText`, `fristTage`, `fristKlasse`, `EBENE_LABEL`, `KATEGORIE_LABEL`).
- Produces: Startseite mit offenen Ausschreibungen, sortiert nach Frist, Filter Ebene/Kategorie/Thema, Abschnitt „Laufend einreichbar".

- [ ] **Step 1: Seite implementieren**

`src/pages/AusschreibungenSeite.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import {
  Ausschreibung,
  Ebene,
  Kategorie,
  EBENE_LABEL,
  KATEGORIE_LABEL,
  fristText,
  fristTage,
  fristKlasse,
} from "../lib/typen";

// Startseite: offene Ausschreibungen nach Frist sortiert, Dringlichkeit
// hervorgehoben (< 30 Tage warnung, < 7 Tage gefahr), Filter nach Ebene,
// Kategorie und Thema. "Laufend einreichbar" als eigener Abschnitt.
export default function AusschreibungenSeite() {
  const [liste, setListe] = useState<Ausschreibung[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ebene, setEbene] = useState<Ebene | "">("");
  const [kategorie, setKategorie] = useState<Kategorie | "">("");
  const [thema, setThema] = useState("");

  useEffect(() => {
    api
      .get<Ausschreibung[]>("/api/ausschreibungen?status=OFFEN")
      .then(setListe)
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }, []);

  const themen = useMemo(() => {
    const s = new Set<string>();
    for (const a of liste) for (const t of a.foerderquelle?.themen ?? []) s.add(t);
    return [...s].sort();
  }, [liste]);

  const gefiltert = useMemo(
    () =>
      liste.filter((a) => {
        const q = a.foerderquelle;
        if (ebene && q?.ebene !== ebene) return false;
        if (kategorie && q?.kategorie !== kategorie && q?.kategorie !== "BEIDES") return false;
        if (thema && !(q?.themen ?? []).includes(thema)) return false;
        return true;
      }),
    [liste, ebene, kategorie, thema]
  );

  const mitFrist = gefiltert.filter((a) => !a.laufendEinreichbar);
  const laufend = gefiltert.filter((a) => a.laufendEinreichbar);

  const auswahlKlasse =
    "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm";

  function zeile(a: Ausschreibung) {
    const tage = fristTage(a);
    return (
      <li key={a.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={"text-sm " + fristKlasse(a)}>
            {fristText(a)}
            {tage !== null && tage >= 0 && (
              <span className="font-normal text-gray-400"> ({tage} Tage)</span>
            )}
          </span>
          <h2 className="text-base font-semibold text-gray-800">{a.titel}</h2>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {a.foerderquelle?.name}
          {a.foerderquelle && (
            <>
              {" · "}
              {EBENE_LABEL[a.foerderquelle.ebene]}
              {" · "}
              {KATEGORIE_LABEL[a.foerderquelle.kategorie]}
            </>
          )}
          {a.foerderhoehe && <> · {a.foerderhoehe}</>}
        </p>
        {a.beschreibung && <p className="text-sm text-gray-600 mt-2">{a.beschreibung}</p>}
        {a.link && (
          <a
            href={a.link}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-marke-600 hover:underline mt-2 inline-block"
          >
            Zur Ausschreibung ↗
          </a>
        )}
      </li>
    );
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Ausschreibungen</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={ebene} onChange={(e) => setEbene(e.target.value as Ebene | "")} className={auswahlKlasse} aria-label="Ebene">
            <option value="">Alle Ebenen</option>
            {Object.entries(EBENE_LABEL).map(([w, l]) => (
              <option key={w} value={w}>{l}</option>
            ))}
          </select>
          <select value={kategorie} onChange={(e) => setKategorie(e.target.value as Kategorie | "")} className={auswahlKlasse} aria-label="Kategorie">
            <option value="">Projekt + Kerngeschäft</option>
            <option value="PROJEKT">Projekt</option>
            <option value="KERNGESCHAEFT">Kerngeschäft</option>
          </select>
          <select value={thema} onChange={(e) => setThema(e.target.value)} className={auswahlKlasse} aria-label="Thema">
            <option value="">Alle Themen</option>
            {themen.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}
      {laedt ? (
        <p className="text-gray-500">Lädt …</p>
      ) : (
        <>
          {mitFrist.length === 0 && laufend.length === 0 && (
            <p className="text-gray-500">Keine offenen Ausschreibungen.</p>
          )}
          <ul className="space-y-3">{mitFrist.map(zeile)}</ul>
          {laufend.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-gray-800 mt-8 mb-3">
                Laufend einreichbar
              </h2>
              <ul className="space-y-3">{laufend.map(zeile)}</ul>
            </>
          )}
        </>
      )}
    </Layout>
  );
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build` (in `foerderungen/frontend/`)
Expected: ohne Fehler

- [ ] **Step 3: Commit**

```bash
git add foerderungen/frontend
git commit -m "Foerderungen: Startseite Ausschreibungen mit Fristen und Filtern"
```

---

### Task 11: Seiten „Förderlandschaft" und Quellen-Detail (Katalog + Bearbeiten)

**Files:**
- Create (ersetzen Platzhalter): `foerderungen/frontend/src/pages/LandschaftSeite.tsx`, `foerderungen/frontend/src/pages/QuelleDetailSeite.tsx`

**Interfaces:**
- Consumes: `api`, `Layout`, Typen/Label aus `lib/typen.ts`; Backend `GET/POST/PATCH /api/quellen`, `GET /api/quellen/:id`, `POST /api/ausschreibungen`.
- Produces: Katalog-Übersicht mit Filtern + „Neue Quelle"-Formular; Detailseite mit Bearbeitungsformular, Ausschreibungsliste und „Neue Ausschreibung"-Formular.

- [ ] **Step 1: LandschaftSeite implementieren**

`src/pages/LandschaftSeite.tsx`:

```tsx
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import {
  Foerderquelle,
  Ebene,
  Kategorie,
  EBENE_LABEL,
  KATEGORIE_LABEL,
} from "../lib/typen";

// Katalog der Foerderlandschaft: aktive Quellen mit Filtern, dazu ein
// einfaches Formular zum Anlegen neuer Quellen.
export default function LandschaftSeite() {
  const [liste, setListe] = useState<Foerderquelle[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ebene, setEbene] = useState<Ebene | "">("");
  const [kategorie, setKategorie] = useState<Kategorie | "">("");
  const [zeigeFormular, setZeigeFormular] = useState(false);

  // Formularfelder fuer eine neue Quelle
  const [name, setName] = useState("");
  const [traeger, setTraeger] = useState("");
  const [neuEbene, setNeuEbene] = useState<Ebene>("BUND");
  const [neuKategorie, setNeuKategorie] = useState<Kategorie>("PROJEKT");
  const [themen, setThemen] = useState("");
  const [webseite, setWebseite] = useState("");
  const [beschreibung, setBeschreibung] = useState("");

  function laden() {
    api
      .get<Foerderquelle[]>("/api/quellen?status=AKTIV")
      .then(setListe)
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }
  useEffect(laden, []);

  const gefiltert = useMemo(
    () =>
      liste.filter(
        (q) =>
          (!ebene || q.ebene === ebene) &&
          (!kategorie || q.kategorie === kategorie || q.kategorie === "BEIDES")
      ),
    [liste, ebene, kategorie]
  );

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    try {
      await api.post<Foerderquelle>("/api/quellen", {
        name,
        traeger,
        ebene: neuEbene,
        kategorie: neuKategorie,
        themen: themen.split(",").map((t) => t.trim()).filter(Boolean),
        webseite: webseite || undefined,
        beschreibung: beschreibung || undefined,
      });
      setName(""); setTraeger(""); setThemen(""); setWebseite(""); setBeschreibung("");
      setZeigeFormular(false);
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  const eingabeKlasse =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marke-500";
  const auswahlKlasse =
    "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm";

  return (
    <Layout>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Förderlandschaft</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={ebene} onChange={(e) => setEbene(e.target.value as Ebene | "")} className={auswahlKlasse} aria-label="Ebene">
            <option value="">Alle Ebenen</option>
            {Object.entries(EBENE_LABEL).map(([w, l]) => (
              <option key={w} value={w}>{l}</option>
            ))}
          </select>
          <select value={kategorie} onChange={(e) => setKategorie(e.target.value as Kategorie | "")} className={auswahlKlasse} aria-label="Kategorie">
            <option value="">Projekt + Kerngeschäft</option>
            <option value="PROJEKT">Projekt</option>
            <option value="KERNGESCHAEFT">Kerngeschäft</option>
          </select>
          <button
            onClick={() => setZeigeFormular((z) => !z)}
            className="rounded-md bg-marke-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-marke-700"
          >
            {zeigeFormular ? "Abbrechen" : "Neue Quelle"}
          </button>
        </div>
      </div>

      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}

      {zeigeFormular && (
        <form onSubmit={anlegen} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 grid gap-3 sm:grid-cols-2">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={eingabeKlasse} />
          <input required value={traeger} onChange={(e) => setTraeger(e.target.value)} placeholder="Träger" className={eingabeKlasse} />
          <select value={neuEbene} onChange={(e) => setNeuEbene(e.target.value as Ebene)} className={eingabeKlasse} aria-label="Ebene der neuen Quelle">
            {Object.entries(EBENE_LABEL).map(([w, l]) => (
              <option key={w} value={w}>{l}</option>
            ))}
          </select>
          <select value={neuKategorie} onChange={(e) => setNeuKategorie(e.target.value as Kategorie)} className={eingabeKlasse} aria-label="Kategorie der neuen Quelle">
            {Object.entries(KATEGORIE_LABEL).map(([w, l]) => (
              <option key={w} value={w}>{l}</option>
            ))}
          </select>
          <input value={themen} onChange={(e) => setThemen(e.target.value)} placeholder="Themen (kommagetrennt)" className={eingabeKlasse} />
          <input value={webseite} onChange={(e) => setWebseite(e.target.value)} placeholder="Webseite (https://…)" className={eingabeKlasse} />
          <textarea value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Beschreibung" className={eingabeKlasse + " sm:col-span-2"} rows={2} />
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700">
              Anlegen
            </button>
          </div>
        </form>
      )}

      {laedt ? (
        <p className="text-gray-500">Lädt …</p>
      ) : gefiltert.length === 0 ? (
        <p className="text-gray-500">Keine Förderquellen gefunden.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {gefiltert.map((q) => (
            <li key={q.id}>
              <Link
                to={`/landschaft/${q.id}`}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-marke-400"
              >
                <h2 className="text-base font-semibold text-gray-800">{q.name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {q.traeger} · {EBENE_LABEL[q.ebene]} · {KATEGORIE_LABEL[q.kategorie]}
                </p>
                {q.themen.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{q.themen.join(", ")}</p>
                )}
                <p className="text-xs text-marke-600 mt-2">
                  {q._count?.ausschreibungen ?? 0} Ausschreibung(en)
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
```

- [ ] **Step 2: QuelleDetailSeite implementieren**

`src/pages/QuelleDetailSeite.tsx`:

```tsx
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import {
  Foerderquelle,
  Ausschreibung,
  Ebene,
  Kategorie,
  EBENE_LABEL,
  KATEGORIE_LABEL,
  fristText,
  fristKlasse,
} from "../lib/typen";

// Detailansicht einer Foerderquelle: Stammdaten bearbeiten, zugehoerige
// Ausschreibungen ansehen und neue anlegen. Archivieren statt Loeschen.
export default function QuelleDetailSeite() {
  const { id } = useParams<{ id: string }>();
  const navigiere = useNavigate();
  const [quelle, setQuelle] = useState<Foerderquelle | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  // Bearbeitungsfelder (werden beim Laden befuellt)
  const [name, setName] = useState("");
  const [traeger, setTraeger] = useState("");
  const [ebene, setEbene] = useState<Ebene>("BUND");
  const [kategorie, setKategorie] = useState<Kategorie>("PROJEKT");
  const [themen, setThemen] = useState("");
  const [webseite, setWebseite] = useState("");
  const [kontakt, setKontakt] = useState("");
  const [beschreibung, setBeschreibung] = useState("");

  // Neue Ausschreibung
  const [neuTitel, setNeuTitel] = useState("");
  const [neuLink, setNeuLink] = useState("");
  const [neuFrist, setNeuFrist] = useState("");
  const [neuLaufend, setNeuLaufend] = useState(false);
  const [neuHoehe, setNeuHoehe] = useState("");

  function laden() {
    if (!id) return;
    api
      .get<Foerderquelle>(`/api/quellen/${id}`)
      .then((q) => {
        setQuelle(q);
        setName(q.name);
        setTraeger(q.traeger);
        setEbene(q.ebene);
        setKategorie(q.kategorie);
        setThemen(q.themen.join(", "));
        setWebseite(q.webseite ?? "");
        setKontakt(q.kontakt ?? "");
        setBeschreibung(q.beschreibung);
      })
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }
  useEffect(laden, [id]);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setMeldung(null);
    try {
      await api.patch(`/api/quellen/${id}`, {
        name,
        traeger,
        ebene,
        kategorie,
        themen: themen.split(",").map((t) => t.trim()).filter(Boolean),
        webseite: webseite || undefined,
        kontakt: kontakt || undefined,
        beschreibung: beschreibung || undefined,
      });
      setMeldung("Gespeichert.");
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  async function archivieren() {
    if (!window.confirm("Quelle archivieren? Sie erscheint dann nicht mehr im Katalog.")) return;
    try {
      await api.patch(`/api/quellen/${id}`, { status: "ARCHIVIERT" });
      navigiere("/landschaft");
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  async function ausschreibungAnlegen(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    try {
      await api.post("/api/ausschreibungen", {
        foerderquelleId: id,
        titel: neuTitel,
        link: neuLink || undefined,
        frist: neuFrist || undefined,
        laufendEinreichbar: neuLaufend,
        foerderhoehe: neuHoehe || undefined,
      });
      setNeuTitel(""); setNeuLink(""); setNeuFrist(""); setNeuLaufend(false); setNeuHoehe("");
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  const eingabeKlasse =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marke-500";

  if (laedt) return <Layout><p className="text-gray-500">Lädt …</p></Layout>;
  if (!quelle) return <Layout><p className="text-gefahr-700">{fehler ?? "Nicht gefunden."}</p></Layout>;

  return (
    <Layout>
      <div className="mb-4">
        <Link to="/landschaft" className="text-sm text-marke-600 hover:underline">
          ← Zur Förderlandschaft
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-800">{quelle.name}</h1>
        <span className="text-sm text-gray-500">
          {EBENE_LABEL[quelle.ebene]} · {KATEGORIE_LABEL[quelle.kategorie]}
        </span>
        <button
          onClick={archivieren}
          className="ml-auto rounded-md border border-gefahr-600 text-gefahr-700 px-3 py-1.5 text-sm font-medium hover:bg-gefahr-50"
        >
          Archivieren
        </button>
      </div>

      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}
      {meldung && <p className="text-erfolg-700 mb-4">{meldung}</p>}

      <form onSubmit={speichern} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-8 grid gap-3 sm:grid-cols-2">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={eingabeKlasse} />
        <input required value={traeger} onChange={(e) => setTraeger(e.target.value)} placeholder="Träger" className={eingabeKlasse} />
        <select value={ebene} onChange={(e) => setEbene(e.target.value as Ebene)} className={eingabeKlasse} aria-label="Ebene">
          {Object.entries(EBENE_LABEL).map(([w, l]) => (
            <option key={w} value={w}>{l}</option>
          ))}
        </select>
        <select value={kategorie} onChange={(e) => setKategorie(e.target.value as Kategorie)} className={eingabeKlasse} aria-label="Kategorie">
          {Object.entries(KATEGORIE_LABEL).map(([w, l]) => (
            <option key={w} value={w}>{l}</option>
          ))}
        </select>
        <input value={themen} onChange={(e) => setThemen(e.target.value)} placeholder="Themen (kommagetrennt)" className={eingabeKlasse} />
        <input value={webseite} onChange={(e) => setWebseite(e.target.value)} placeholder="Webseite" className={eingabeKlasse} />
        <input value={kontakt} onChange={(e) => setKontakt(e.target.value)} placeholder="Kontakt" className={eingabeKlasse} />
        <textarea value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Beschreibung" className={eingabeKlasse + " sm:col-span-2"} rows={3} />
        <div className="sm:col-span-2">
          <button type="submit" className="rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700">
            Speichern
          </button>
        </div>
      </form>

      <h2 className="text-lg font-semibold text-gray-800 mb-3">Ausschreibungen</h2>
      <ul className="space-y-2 mb-6">
        {(quelle.ausschreibungen ?? []).length === 0 && (
          <li className="text-gray-500 text-sm">Noch keine Ausschreibungen erfasst.</li>
        )}
        {(quelle.ausschreibungen ?? []).map((a: Ausschreibung) => (
          <li key={a.id} className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-baseline gap-x-3">
            <span className={"text-sm " + fristKlasse(a)}>{fristText(a)}</span>
            <span className="text-sm font-medium text-gray-800">{a.titel}</span>
            <span className="text-xs text-gray-400">{a.status}</span>
            {a.link && (
              <a href={a.link} target="_blank" rel="noreferrer" className="text-xs text-marke-600 hover:underline">
                Link ↗
              </a>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={ausschreibungAnlegen} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 grid gap-3 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-sm font-semibold text-gray-700">Neue Ausschreibung</h3>
        <input required value={neuTitel} onChange={(e) => setNeuTitel(e.target.value)} placeholder="Titel" className={eingabeKlasse} />
        <input value={neuLink} onChange={(e) => setNeuLink(e.target.value)} placeholder="Link (https://…)" className={eingabeKlasse} />
        <input type="date" value={neuFrist} onChange={(e) => setNeuFrist(e.target.value)} className={eingabeKlasse} aria-label="Frist" disabled={neuLaufend} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={neuLaufend} onChange={(e) => setNeuLaufend(e.target.checked)} />
          laufend einreichbar
        </label>
        <input value={neuHoehe} onChange={(e) => setNeuHoehe(e.target.value)} placeholder="Förderhöhe (Freitext)" className={eingabeKlasse} />
        <div className="sm:col-span-2">
          <button type="submit" className="rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700">
            Anlegen
          </button>
        </div>
      </form>
    </Layout>
  );
}
```

- [ ] **Step 3: Build prüfen**

Run: `npm run build` (in `foerderungen/frontend/`)
Expected: ohne Fehler

- [ ] **Step 4: Commit**

```bash
git add foerderungen/frontend
git commit -m "Foerderungen: Foerderlandschaft-Katalog und Quellen-Detailseite"
```

---

### Task 12: Seite „Prüfen" (Vorschlags-Warteschlange)

**Files:**
- Create (ersetzt Platzhalter): `foerderungen/frontend/src/pages/PruefenSeite.tsx`

**Interfaces:**
- Consumes: `api`, `Layout`, Typen aus `lib/typen.ts`; Backend `GET /api/quellen?status=VORGESCHLAGEN`, `GET /api/ausschreibungen?status=VORGESCHLAGEN`, `PATCH`-Endpunkte.
- Produces: Prüf-Ansicht: vorgeschlagene Quellen und Ausschreibungen mit „Übernehmen"/„Ablehnen"; Aktualisierungsvorschläge zeigen alt/neu nebeneinander.

- [ ] **Step 1: Seite implementieren**

`src/pages/PruefenSeite.tsx`:

```tsx
import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import {
  Ausschreibung,
  Foerderquelle,
  EBENE_LABEL,
  KATEGORIE_LABEL,
  fristText,
} from "../lib/typen";

// Pruef-Warteschlange: alles, was der Scanner vorgeschlagen hat. Nichts davon
// erscheint in den Hauptansichten, bevor es hier uebernommen wurde.
// Uebernehmen: Quelle -> AKTIV, Ausschreibung -> OFFEN (Aktualisierungs-
// vorschlaege uebertragen dabei ihre Felder auf die Bestandszeile).
// Ablehnen: Quelle -> ARCHIVIERT, Ausschreibung -> ABGELEHNT (Tombstones).
export default function PruefenSeite() {
  const [quellen, setQuellen] = useState<Foerderquelle[]>([]);
  const [ausschreibungen, setAusschreibungen] = useState<Ausschreibung[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  function laden() {
    setLaedt(true);
    Promise.all([
      api.get<Foerderquelle[]>("/api/quellen?status=VORGESCHLAGEN"),
      api.get<Ausschreibung[]>("/api/ausschreibungen?status=VORGESCHLAGEN"),
    ])
      .then(([q, a]) => {
        setQuellen(q);
        setAusschreibungen(a);
      })
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }
  useEffect(laden, []);

  async function entscheideQuelle(id: string, status: "AKTIV" | "ARCHIVIERT") {
    try {
      await api.patch(`/api/quellen/${id}`, { status });
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  async function entscheideAusschreibung(id: string, status: "OFFEN" | "ABGELEHNT") {
    try {
      await api.patch(`/api/ausschreibungen/${id}`, { status });
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  function knoepfe(uebernehmen: () => void, ablehnen: () => void) {
    return (
      <div className="flex gap-2 mt-3">
        <button
          onClick={uebernehmen}
          className="rounded-md bg-erfolg-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-erfolg-700"
        >
          Übernehmen
        </button>
        <button
          onClick={ablehnen}
          className="rounded-md border border-gefahr-600 text-gefahr-700 px-3 py-1.5 text-sm font-medium hover:bg-gefahr-50"
        >
          Ablehnen
        </button>
      </div>
    );
  }

  return (
    <Layout>
      <h1 className="text-xl font-semibold text-gray-800 mb-6">Prüfen</h1>
      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}
      {laedt ? (
        <p className="text-gray-500">Lädt …</p>
      ) : quellen.length === 0 && ausschreibungen.length === 0 ? (
        <p className="text-gray-500">Keine offenen Vorschläge – alles geprüft.</p>
      ) : (
        <>
          {quellen.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                Vorgeschlagene Förderquellen
              </h2>
              <ul className="space-y-3 mb-8">
                {quellen.map((q) => (
                  <li key={q.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="text-base font-semibold text-gray-800">{q.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {q.traeger} · {EBENE_LABEL[q.ebene]} · {KATEGORIE_LABEL[q.kategorie]}
                    </p>
                    {q.beschreibung && (
                      <p className="text-sm text-gray-600 mt-1">{q.beschreibung}</p>
                    )}
                    {q.webseite && (
                      <a href={q.webseite} target="_blank" rel="noreferrer" className="text-sm text-marke-600 hover:underline mt-1 inline-block">
                        {q.webseite} ↗
                      </a>
                    )}
                    {knoepfe(
                      () => entscheideQuelle(q.id, "AKTIV"),
                      () => entscheideQuelle(q.id, "ARCHIVIERT")
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {ausschreibungen.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                Vorgeschlagene Ausschreibungen
              </h2>
              <ul className="space-y-3">
                {ausschreibungen.map((a) => (
                  <li key={a.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    {a.aktualisiertAusschreibung && (
                      <p className="text-xs font-semibold text-warnung-700 uppercase tracking-wide mb-1">
                        Aktualisierungsvorschlag
                      </p>
                    )}
                    <h3 className="text-base font-semibold text-gray-800">{a.titel}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {a.foerderquelle?.name}
                      {a.foerderhoehe && <> · {a.foerderhoehe}</>}
                    </p>
                    {a.aktualisiertAusschreibung ? (
                      <p className="text-sm mt-1">
                        <span className="text-gray-500">
                          Frist bisher: {fristText(a.aktualisiertAusschreibung)}
                        </span>
                        {" → "}
                        <span className="font-medium text-gray-800">neu: {fristText(a)}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-gray-700 mt-1">Frist: {fristText(a)}</p>
                    )}
                    {a.beschreibung && (
                      <p className="text-sm text-gray-600 mt-1">{a.beschreibung}</p>
                    )}
                    {a.link && (
                      <a href={a.link} target="_blank" rel="noreferrer" className="text-sm text-marke-600 hover:underline mt-1 inline-block">
                        Quelle des Scanners ↗
                      </a>
                    )}
                    {knoepfe(
                      () => entscheideAusschreibung(a.id, "OFFEN"),
                      () => entscheideAusschreibung(a.id, "ABGELEHNT")
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Layout>
  );
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build` (in `foerderungen/frontend/`)
Expected: ohne Fehler

- [ ] **Step 3: Commit**

```bash
git add foerderungen/frontend
git commit -m "Foerderungen: Pruef-Warteschlange (Uebernehmen/Ablehnen, alt/neu-Vergleich)"
```

---

### Task 13: Seiten „Scans" und „Einstellungen"

**Files:**
- Create (ersetzen Platzhalter): `foerderungen/frontend/src/pages/ScansSeite.tsx`, `foerderungen/frontend/src/pages/EinstellungenSeite.tsx`

**Interfaces:**
- Consumes: `api`, `Layout`, `ScanLauf` aus `lib/typen.ts`; Backend `GET/POST /api/scans`, `GET /api/einstellungen`, `PUT /api/einstellungen/llm`, `PUT /api/einstellungen/scan`.
- Produces: Scan-Verlauf mit „Scan jetzt starten" und Warnbanner bei fehlgeschlagenem letztem Lauf; Einstellungs-Seite mit LLM-Provider/Modell/API-Key und Scan-Zeitplan.

- [ ] **Step 1: ScansSeite implementieren**

`src/pages/ScansSeite.tsx`:

```tsx
import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { ScanLauf } from "../lib/typen";

// Scan-Verlauf + manueller Start. Ein fehlgeschlagener letzter Lauf wird als
// Warnbanner angezeigt (Spec: "Letzter Scan fehlgeschlagen am ...").
export default function ScansSeite() {
  const [laeufe, setLaeufe] = useState<ScanLauf[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  function laden() {
    api
      .get<{ laeuft: boolean; laeufe: ScanLauf[] }>("/api/scans")
      .then((d) => {
        setLaeuft(d.laeuft);
        setLaeufe(d.laeufe);
      })
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }
  useEffect(() => {
    laden();
    // Solange ein Scan laeuft, alle 5 s auffrischen.
    const t = setInterval(laden, 5000);
    return () => clearInterval(t);
  }, []);

  async function starten() {
    setFehler(null);
    try {
      await api.post("/api/scans");
      laden();
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  const letzter = laeufe[0];
  const zeit = (iso: string) =>
    new Date(iso).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" });

  function statistikText(s: ScanLauf["statistik"]): string {
    if (!s) return "–";
    const u = s.ueberwachung ?? {};
    const e = s.entdeckung ?? {};
    return `Überwachung: ${u.neu ?? 0} neu, ${u.aktualisierungen ?? 0} Aktualisierungen · Entdeckung: ${e.neu ?? 0} neue Quellen`;
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Scans</h1>
        <button
          onClick={starten}
          disabled={laeuft}
          className="ml-auto rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          {laeuft ? "Scan läuft …" : "Scan jetzt starten"}
        </button>
      </div>

      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}
      {letzter?.fehler && (
        <div className="bg-warnung-50 border border-warnung-600 text-warnung-700 rounded-md px-4 py-3 text-sm mb-6">
          Letzter Scan fehlgeschlagen am {zeit(letzter.gestartet)}: {letzter.fehler}
        </div>
      )}

      {laedt ? (
        <p className="text-gray-500">Lädt …</p>
      ) : laeufe.length === 0 ? (
        <p className="text-gray-500">Noch keine Scans gelaufen.</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="px-4 py-2 font-medium">Gestartet</th>
                <th className="px-4 py-2 font-medium">Auslöser</th>
                <th className="px-4 py-2 font-medium">Ergebnis</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {laeufe.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">{zeit(l.gestartet)}</td>
                  <td className="px-4 py-2">{l.ausloeser === "ZEITPLAN" ? "Zeitplan" : "Manuell"}</td>
                  <td className="px-4 py-2">{statistikText(l.statistik)}</td>
                  <td className="px-4 py-2">
                    {!l.beendet ? (
                      <span className="text-marke-600">läuft …</span>
                    ) : l.fehler ? (
                      <span className="text-gefahr-700" title={l.fehler}>Fehler</span>
                    ) : (
                      <span className="text-erfolg-700">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
```

- [ ] **Step 2: EinstellungenSeite implementieren**

`src/pages/EinstellungenSeite.tsx`:

```tsx
import { FormEvent, useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";

// Einstellungen nach dem Muster des Stunden-Admin-Tabs: LLM-Provider, Modell
// und API-Key (nur "gesetzt/nicht gesetzt" sichtbar, nie der Klartext) sowie
// der Scan-Zeitplan (Wochentag + Stunde, an/aus).
interface Einstellungen {
  llm: { provider: "anthropic" | "openai" | "dummy"; modell: string; apiKeyGesetzt: boolean };
  scan: { aktiv: boolean; wochentag: number; stunde: number };
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export default function EinstellungenSeite() {
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const [provider, setProvider] = useState<Einstellungen["llm"]["provider"]>("dummy");
  const [modell, setModell] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyGesetzt, setApiKeyGesetzt] = useState(false);

  const [scanAktiv, setScanAktiv] = useState(false);
  const [wochentag, setWochentag] = useState(1);
  const [stunde, setStunde] = useState(6);

  useEffect(() => {
    api
      .get<Einstellungen>("/api/einstellungen")
      .then((d) => {
        setProvider(d.llm.provider);
        setModell(d.llm.modell);
        setApiKeyGesetzt(d.llm.apiKeyGesetzt);
        setScanAktiv(d.scan.aktiv);
        setWochentag(d.scan.wochentag);
        setStunde(d.scan.stunde);
      })
      .catch((e) => setFehler(e.message))
      .finally(() => setLaedt(false));
  }, []);

  async function llmSpeichern(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setMeldung(null);
    try {
      await api.put("/api/einstellungen/llm", {
        provider,
        modell: modell || undefined,
        apiKey: apiKey || undefined,
      });
      setApiKey("");
      if (apiKey) setApiKeyGesetzt(true);
      setMeldung("LLM-Einstellungen gespeichert.");
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  async function scanSpeichern(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setMeldung(null);
    try {
      await api.put("/api/einstellungen/scan", { aktiv: scanAktiv, wochentag, stunde });
      setMeldung("Scan-Zeitplan gespeichert.");
    } catch (err) {
      setFehler((err as Error).message);
    }
  }

  const eingabeKlasse =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marke-500";

  if (laedt) return <Layout><p className="text-gray-500">Lädt …</p></Layout>;

  return (
    <Layout>
      <h1 className="text-xl font-semibold text-gray-800 mb-6">Einstellungen</h1>
      {fehler && <p className="text-gefahr-700 mb-4">{fehler}</p>}
      {meldung && <p className="text-erfolg-700 mb-4">{meldung}</p>}

      <form onSubmit={llmSpeichern} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 max-w-xl">
        <h2 className="text-base font-semibold text-gray-800 mb-1">KI-Anbieter (Scanner)</h2>
        <p className="text-sm text-gray-500 mb-4">
          Der Scanner braucht einen Anbieter mit Websuche (Anthropic oder OpenAI).
          „Attrappe" liefert Beispieldaten zum Testen ohne API-Key.
        </p>
        <div className="grid gap-3">
          <label className="text-sm text-gray-700">
            Anbieter
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Einstellungen["llm"]["provider"])}
              className={eingabeKlasse + " mt-1"}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="dummy">Attrappe (ohne API-Key)</option>
            </select>
          </label>
          <label className="text-sm text-gray-700">
            Modell (leer = Standard)
            <input
              value={modell}
              onChange={(e) => setModell(e.target.value)}
              placeholder={provider === "openai" ? "gpt-4.1" : "claude-sonnet-4-6"}
              className={eingabeKlasse + " mt-1"}
            />
          </label>
          <label className="text-sm text-gray-700">
            API-Key {apiKeyGesetzt && <span className="text-erfolg-700">(gesetzt – leer lassen zum Behalten)</span>}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyGesetzt ? "••••••••" : "API-Key eingeben"}
              className={eingabeKlasse + " mt-1"}
              autoComplete="off"
            />
          </label>
        </div>
        <button type="submit" className="mt-4 rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700">
          Speichern
        </button>
      </form>

      <form onSubmit={scanSpeichern} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 max-w-xl">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Automatischer Scan</h2>
        <p className="text-sm text-gray-500 mb-4">
          Durchsucht die Förderlandschaft regelmäßig nach neuen Ausschreibungen
          und Quellen. Funde landen zur Prüfung in der Warteschlange.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
          <input type="checkbox" checked={scanAktiv} onChange={(e) => setScanAktiv(e.target.checked)} />
          Automatischen Scan aktivieren
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-gray-700">
            Wochentag
            <select value={wochentag} onChange={(e) => setWochentag(Number(e.target.value))} className={eingabeKlasse + " mt-1"} disabled={!scanAktiv}>
              {WOCHENTAGE.map((w, i) => (
                <option key={i} value={i}>{w}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700">
            Uhrzeit
            <select value={stunde} onChange={(e) => setStunde(Number(e.target.value))} className={eingabeKlasse + " mt-1"} disabled={!scanAktiv}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="mt-4 rounded-md bg-marke-600 text-white px-4 py-2 text-sm font-medium hover:bg-marke-700">
          Speichern
        </button>
      </form>
    </Layout>
  );
}
```

- [ ] **Step 3: Build prüfen**

Run: `npm run build` (in `foerderungen/frontend/`)
Expected: ohne Fehler

- [ ] **Step 4: Commit**

```bash
git add foerderungen/frontend
git commit -m "Foerderungen: Scan-Verlauf und Einstellungen (LLM-Provider, Zeitplan)"
```

---

### Task 14: Suite-Integration (Dockerfile, Registry, nginx, docker-compose, .env, README)

**Files:**
- Create: `foerderungen/backend/Dockerfile`
- Modify: `backend/prisma/seed.ts` (Tool-Registry)
- Modify: `nginx/nginx.conf` (Location-Blöcke + Provision-Sperre)
- Modify: `docker-compose.yml` (Services `foerderungen-db`, `foerderungen-app`, Volume)
- Modify: `.env.example` (neue Variablen)
- Modify: `README.md` (Tool-Liste + Architektur-Diagramm)

**Interfaces:**
- Consumes: alles Vorherige (Backend + Frontend baubar).
- Produces: das Tool ist Teil des Produktions-Deployments (`docker compose --profile produktion up -d --build`) und erscheint im Portal.

- [ ] **Step 1: Dockerfile**

`foerderungen/backend/Dockerfile`: **kopieren** aus `stunden/backend/Dockerfile` mit genau drei Änderungen:
1. `ENV VITE_BASE=/stunden/` → `ENV VITE_BASE=/foerderungen/`
2. `EXPOSE 3002` → `EXPOSE 3003`
3. Nach `COPY backend/prisma ./prisma` in der Runtime-Stufe zusätzlich sicherstellen, dass `prisma/seed.ts` mitkommt (ist im prisma-Ordner enthalten – keine Extra-Zeile nötig; nur prüfen).

Zusätzlich im CMD den Seed nach der Migration ausführen (Initialkatalog beim Erststart; Seed ist idempotent). CMD-Zeile ersetzen durch:

```dockerfile
CMD ["sh", "-c", "n=0; until npx prisma migrate deploy; do n=$((n+1)); if [ $n -ge 6 ]; then echo 'Migration nach 6 Versuchen fehlgeschlagen - Abbruch'; exit 1; fi; echo \"Migration fehlgeschlagen (Versuch $n/6) - erneuter Versuch in 10s...\"; sleep 10; done && npx tsx prisma/seed.ts && exec node dist/index.js"]
```

Hinweis: `tsx` ist devDependency – im Runtime-Image (`npm install --omit=dev`) nicht vorhanden. Deshalb in `foerderungen/backend/package.json` `tsx` in die **dependencies** verschieben (wie es der Portal-Container für den Import handhabt) ODER den Seed nach `prisma/seed.js` kompilieren. Entscheidung: `tsx` in dependencies verschieben (einfachster Weg, Muster Portal).

- [ ] **Step 2: Tool-Registry**

In `backend/prisma/seed.ts` im `tools`-Array nach dem `stunden`-Eintrag ergänzen:

```ts
    {
      slug: "foerderungen",
      name: "Förderungen",
      beschreibung: "Österreichische Förderlandschaft und Ausschreibungsfristen im Blick",
      pfad: "/foerderungen/",
      rollen: ["nutzer"],
      reihenfolge: 3,
      provisionUrl: process.env.FOERDERUNGEN_URL ?? "http://foerderungen-app:3003",
    },
```

- [ ] **Step 3: nginx**

In `nginx/nginx.conf`:

1. Provision-Sperre erweitern – Zeile
   `location ~ ^/(handkassen|stunden)/api/provision(/|$) { return 404; }`
   ersetzen durch
   `location ~ ^/(handkassen|stunden|foerderungen)/api/provision(/|$) { return 404; }`
2. Nach dem Stunden-Block ergänzen:

```nginx
    # --- Foerderungen ---------------------------------------------------------
    location = /foerderungen {
        return 301 /foerderungen/;
    }
    location /foerderungen/ {
        set $upstream_foerderungen http://foerderungen-app:3003;
        rewrite ^/foerderungen/(.*)$ /$1 break;
        proxy_pass $upstream_foerderungen;
    }
```

- [ ] **Step 4: docker-compose.yml**

Nach dem `stunden-app`-Block ergänzen (Muster stunden; Werte beachten):

```yaml
  # ---------------------------------------------------------------------------
  # Foerderungen (Build-Kontext ./foerderungen)
  # ---------------------------------------------------------------------------
  foerderungen-db:
    profiles: ["produktion"]
    image: postgres:16
    restart: unless-stopped
    logging: *logging
    environment:
      POSTGRES_USER: ${FOERDERUNGEN_DB_USER:-foerderungen}
      POSTGRES_PASSWORD: ${FOERDERUNGEN_DB_PASSWORD:-foerderungen_dev_passwort}
      POSTGRES_DB: ${FOERDERUNGEN_DB_NAME:-foerderungen}
    volumes:
      - foerderungen_db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${FOERDERUNGEN_DB_USER:-foerderungen}"]
      interval: 5s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 512M

  foerderungen-app:
    profiles: ["produktion"]
    build:
      context: ./foerderungen
      dockerfile: backend/Dockerfile
    restart: unless-stopped
    logging: *logging
    depends_on:
      foerderungen-db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${FOERDERUNGEN_DB_USER:-foerderungen}:${FOERDERUNGEN_DB_PASSWORD:-foerderungen_dev_passwort}@foerderungen-db:5432/${FOERDERUNGEN_DB_NAME:-foerderungen}
      JWT_SECRET: ${JWT_SECRET:-bitte-aendern}
      ENCRYPTION_KEY: ${FOERDERUNGEN_ENCRYPTION_KEY:-bitte-32-zeichen-schluessel-setzen}
      PROVISION_SECRET: ${PROVISION_SECRET:-bitte-aendern-provision}
      PORT: 3003
      NODE_ENV: production
      TRUST_PROXY: "1"
      COOKIE_INSECURE: ${COOKIE_INSECURE:-}
      TOOL_SLUG: foerderungen
      SUITE_URL: http://portal-app:3000
      STATIC_DIR: /app/static
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3003/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 40s
    deploy:
      resources:
        limits:
          memory: 768M
```

Und im `volumes:`-Abschnitt am Dateiende ergänzen:

```yaml
  foerderungen_db_data:
    name: foerderungen_db_data
```

Am Service `portal-app` ist NICHTS zu ändern: er setzt auch für Handkassen/Stunden keine Tool-URLs – der Registry-Seed (Task 14 Step 2) nutzt den Default `http://foerderungen-app:3003`.

- [ ] **Step 5: .env.example**

In `.env.example` nach dem `STUNDEN_…`-Block ergänzen:

```
FOERDERUNGEN_DB_USER=foerderungen
FOERDERUNGEN_DB_PASSWORD=bitte-aendern
FOERDERUNGEN_DB_NAME=foerderungen

# Verschluesselung der im Foerderungen-Tool gespeicherten API-Keys (genau 32 Zeichen).
FOERDERUNGEN_ENCRYPTION_KEY=bitte-32-zeichen-schluessel-hier
```

- [ ] **Step 6: README.md aktualisieren**

In `README.md`:
1. Tool-Liste ergänzen: `- **Förderungen** (Unterordner \`foerderungen/\`)`
2. Architektur-Diagramm um die Zeile `├── /foerderungen/ → Förderungen :3003 (Präfix wird gestrippt)` ergänzen.
3. Im Entwicklungs-Abschnitt den Hinweis auf das vierte Tool ergänzen (Dev-DB auf 5435, Backend 3003, Frontend 5176).

- [ ] **Step 7: Verifikation Registry + Build**

```powershell
# Registry-Seed gegen die Dev-Suite-DB (Suite-DB muss laufen):
cd backend; npm run seed
# Produktions-Build des neuen Images (ohne Start):
cd ..; docker compose --profile produktion build foerderungen-app
```

Expected: Seed meldet Upsert ohne Fehler; Docker-Build läuft durch (Frontend-Build mit VITE_BASE=/foerderungen/, Backend-Build, Runtime-Stufe).

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/seed.ts nginx/nginx.conf docker-compose.yml .env.example README.md foerderungen/backend/Dockerfile foerderungen/backend/package.json
git commit -m "Foerderungen: Suite-Integration (Registry, nginx, docker-compose, Dockerfile)"
```

---

### Task 15: Ende-zu-Ende-Prüfung (Dev-Smoke-Test)

**Files:**
- Keine neuen Dateien; ggf. Korrekturen aus den Funden.

**Interfaces:**
- Consumes: alles.
- Produces: verifiziertes Gesamtsystem im Dev-Modus.

- [ ] **Step 1: Alle Backend-Tests laufen lassen**

Run (aus `foerderungen/backend/`): `npx cross-env TEST_DATABASE_URL=postgresql://foerderungen:foerderungen_dev_passwort@localhost:5435/foerderungen_test vitest run`
Expected: PASS (alle Tests aus Tasks 1–7)

- [ ] **Step 2: Dev-Stack starten**

```powershell
# 1. Suite-DB + Foerderungen-Dev-DB
docker compose up -d suite-db
cd foerderungen; docker compose up -d db
# 2. Suite-Backend (Terminal A): cd backend; npm run dev
# 3. Foerderungen-Backend (Terminal B): cd foerderungen/backend; npm run dev
# 4. Foerderungen-Frontend (Terminal C): cd foerderungen/frontend; npm run dev
# 5. Portal-Frontend (Terminal D): cd portal; npm run dev
```

Vorher einmalig: `npm run seed` in `foerderungen/backend/` (Initialkatalog in die Dev-DB).

- [ ] **Step 3: Smoke-Test durchklicken**

1. Portal öffnen (http://localhost:5175), als `admin`/`admin123` anmelden.
2. In der Verwaltung dem admin-Benutzer Zugriff `foerderungen: nutzer` geben (Registry-Seed aus Task 14 muss gelaufen sein).
3. http://localhost:5176 öffnen – Tool lädt mit Layout, Kachel-Katalog zeigt die 15 Seed-Quellen unter „Förderlandschaft".
4. „Einstellungen": Provider „Attrappe" belassen; „Scans" → „Scan jetzt starten" → nach wenigen Sekunden erscheint ein Lauf mit Statistik.
5. „Prüfen" zeigt den Dummy-Vorschlag (1 Ausschreibung, 1 Quelle) – Ausschreibung übernehmen, Quelle ablehnen.
6. Startseite zeigt die übernommene Ausschreibung mit Frist (~30 Tage, warnung-Farbe).
7. Quelle anlegen, bearbeiten, Ausschreibung manuell anlegen – alles ohne Konsolenfehler.

Expected: alle Schritte funktionieren; gefundene Fehler VOR dem Abschluss beheben (systematic-debugging), Fixes einzeln committen.

- [ ] **Step 4: Abschluss-Commit (falls Korrekturen)**

```bash
git add -A
git commit -m "Foerderungen: Korrekturen aus dem Ende-zu-Ende-Smoke-Test"
```

---

## Hinweise für die Ausführung

- **Reihenfolge:** Tasks 1–8 (Backend) strikt sequenziell; Tasks 10–13 (Seiten) sind nach Task 9 unabhängig voneinander. Task 14 braucht 1–13, Task 15 alles.
- **Echter LLM-Test:** Der Anthropic-/OpenAI-Pfad wird bewusst NICHT automatisiert getestet (Kosten, Nichtdeterminismus). Nach dem Deployment einmal manuell: API-Key in den Einstellungen hinterlegen, Scan starten, Prüf-Ansicht kontrollieren.
- **Seed-Katalog:** Die 15 Einträge sind Rechercheausgangspunkt; Webseiten/Details verifiziert die Redaktion im Werkzeug. Kein Blocker für die Umsetzung.

