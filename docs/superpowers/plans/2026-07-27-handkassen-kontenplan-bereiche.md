# Handkassen: Kontenpläne je Bereich freigeben — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Konten werden je Bereich freigegeben (n:m); jede Kostenstelle sieht und bucht nur die ihrem Bereich freigegebenen Konten, serverseitig durchgesetzt.

**Architecture:** Neue n:m-Tabelle `BereichKonto` zwischen `Bereich` und `Konto`. Die Buchungsmaske lädt Konten gefiltert über `GET /konten?kostenstelle=<id>`; ein gemeinsamer Prüf-Helfer `pruefeKontenFreigabe` erzwingt die Freigabe beim Anlegen und Korrigieren von Buchungen. Der Admin verwaltet Freigaben per Bereichs-Mehrfachauswahl im Konto-Formular. Bestehende Konten werden per Datenmigration für alle Bereiche freigegeben.

**Tech Stack:** Node 20, Express 4, Prisma 5 (PostgreSQL 16), TypeScript (ESM, Import-Endung `.js`), React 18 + Vite + Tailwind, Vitest + Supertest.

## Global Constraints

- Alles Deutsch: Bezeichner, Kommentare, UI-Texte, Commit-Nachrichten (ASCII-Umlaute ae/oe/ue in Commits).
- Handkassen-Backend ist ESM: relative Importe **immer mit `.js`-Endung** (`../lib/db.js`).
- **Kontonummer bleibt global eindeutig** — ein gemeinsamer Katalog, keine Duplikate.
- Durchsetzung der Freigabe **serverseitig** (nicht nur UI), beim Anlegen UND Korrigieren.
- **Migration:** alle bestehenden Konten werden für **alle** Bereiche freigegeben (nichts bricht, sofort buchbar).
- Historische Buchungen bleiben unberührt (hängen an `kontoId`).
- Geldbeträge in Cent (unverändert; hier nicht betroffen).
- Revisionssicher: Admin-Änderungen an Freigaben ins `audit_log`.
- Integrationstests laufen nur mit gesetzter `TEST_DATABASE_URL`; Helfer `resetDb()`/`seedBasis()`/`alsAgent()`/`buchungEingabe()` aus `src/test/helfer.ts`.

**Testlauf (alle Backend-Aufgaben):** aus `handkassen/backend`, mit erreichbarer Test-DB:
```
TEST_DATABASE_URL=postgresql://test:test@localhost:5432/test npx prisma db push --skip-generate
TEST_DATABASE_URL=postgresql://test:test@localhost:5432/test npx vitest run <datei>
```

---

### Task 1: Datenmodell `BereichKonto` + Migration (all-to-all) + Test-Helfer

**Files:**
- Modify: `handkassen/backend/prisma/schema.prisma` (Modelle `Bereich`, `Konto`; neues Modell `BereichKonto`)
- Create: `handkassen/backend/prisma/migrations/<zeitstempel>_konto_bereich_freigabe/migration.sql`
- Modify: `handkassen/backend/src/test/helfer.ts` (resetDb-TRUNCATE, seedBasis-Freigabe)

**Interfaces:**
- Produces: Prisma-Modell `BereichKonto { bereichId Int, kontoId Int }` mit `@@id([bereichId, kontoId])` und `@@map("bereich_konto")`; Relationen `Bereich.konten BereichKonto[]`, `Konto.bereiche BereichKonto[]`. Tabelle `bereich_konto` mit Spalten `"bereichId"`, `"kontoId"`.

- [ ] **Step 1: Schema erweitern** — in `handkassen/backend/prisma/schema.prisma`:

Im Modell `Bereich` (nach `kostenstellen Kostenstelle[]`) ergänzen:
```prisma
  konten        BereichKonto[]
```
Im Modell `Konto` (nach `positionen  BuchungsPosition[]`) ergänzen:
```prisma
  bereiche    BereichKonto[]
```
Nach dem Modell `Kassenart` (oder ans Ende der Stammdaten-Modelle) neues Modell einfügen:
```prisma
// n:m – welche Konten sind fuer welchen Bereich freigegeben.
// Ein Eintrag = "dieses Konto ist fuer diesen Bereich buchbar".
// Entfernen einer Freigabe loescht KEINE Buchungen (die haengen an kontoId).
model BereichKonto {
  bereichId Int
  kontoId   Int
  bereich   Bereich @relation(fields: [bereichId], references: [id])
  konto     Konto   @relation(fields: [kontoId], references: [id])

  @@id([bereichId, kontoId])
  @@map("bereich_konto")
}
```

- [ ] **Step 2: Migration erzeugen (nur Datei, noch nicht anwenden)**

Run (aus `handkassen/backend`, mit Entwicklungs-DB in `DATABASE_URL`):
```
npx prisma migrate dev --name konto_bereich_freigabe --create-only
```
Expected: neuer Ordner `prisma/migrations/<zeitstempel>_konto_bereich_freigabe/` mit `migration.sql`, die `CREATE TABLE "bereich_konto" (...)` enthält.

- [ ] **Step 3: Datenmigration anhängen (all-to-all)** — ans Ende der erzeugten `migration.sql`:

```sql
-- Bestandsdaten uebernehmen: alle vorhandenen Konten fuer alle Bereiche freigeben.
INSERT INTO "bereich_konto" ("bereichId", "kontoId")
SELECT b."id", k."id" FROM "bereich" b CROSS JOIN "konto" k
ON CONFLICT DO NOTHING;
```

- [ ] **Step 4: Migration anwenden + Client erzeugen**

Run:
```
npx prisma migrate dev
npx prisma generate
```
Expected: „All migrations have been successfully applied.", Client neu erzeugt, kein Fehler.

- [ ] **Step 5: Test-Helfer anpassen** — `handkassen/backend/src/test/helfer.ts`:

`resetDb()` TRUNCATE-Liste um `bereich_konto` erweitern (vor `bereich`, wegen FK):
```ts
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_log, buchungsposition, buchung, beleg, abschluss,
      benutzer_kostenstelle, monats_sperre, kostenstelle,
      bereich_konto, bereich, kassenart, konto, steuersatz, benutzer,
      backup_konfig, allgemein_konfig
    RESTART IDENTITY CASCADE;
  `);
```

In `seedBasis()` direkt nach dem Anlegen von `konto` die Freigabe für den Testbereich setzen (damit Buchungstests unter der späteren Durchsetzung weiter grün sind):
```ts
  const konto = await prisma.konto.create({ data: { nummer: "50000", bezeichnung: "Testkonto" } });
  await prisma.bereichKonto.create({ data: { bereichId: bereich.id, kontoId: konto.id } });
```

- [ ] **Step 6: Bestehende Tests laufen lassen (Regression)**

Run:
```
TEST_DATABASE_URL=... npx prisma db push --skip-generate
TEST_DATABASE_URL=... npx vitest run
```
Expected: alle bisherigen Tests grün (die Freigabe in seedBasis verändert kein Verhalten, solange die Durchsetzung noch nicht existiert).

- [ ] **Step 7: Commit**
```
git add handkassen/backend/prisma/schema.prisma handkassen/backend/prisma/migrations handkassen/backend/src/test/helfer.ts
git commit -m "Handkassen: Modell BereichKonto (n:m Konto-Bereich) + Migration all-to-all + Test-Helfer"
```

---

### Task 2: Freigabe-Prüfhelfer `pruefeKontenFreigabe`

**Files:**
- Create: `handkassen/backend/src/lib/kontoFreigabe.ts`
- Create: `handkassen/backend/src/lib/kontoFreigabe.integration.test.ts`

**Interfaces:**
- Consumes: Prisma-Modelle aus Task 1 (`Konto.bereiche`, `Kostenstelle.bereichId`).
- Produces: `pruefeKontenFreigabe(kostenstelleId: number, kontoIds: number[]): Promise<{ ok: true } | { ok: false; fehler: string }>` — prüft, dass jedes Konto existiert, aktiv und dem Bereich der Kostenstelle freigegeben ist.

- [ ] **Step 1: Failing test schreiben** — `handkassen/backend/src/lib/kontoFreigabe.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db.js";
import { resetDb, seedBasis } from "../test/helfer.js";
import { pruefeKontenFreigabe } from "./kontoFreigabe.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("pruefeKontenFreigabe (Integration)", () => {
  let ksA = 0;
  let freigegeben = 0;

  beforeEach(async () => {
    await resetDb();
    const basis = await seedBasis();
    ksA = basis.ksA;
    freigegeben = basis.kontoId; // in seedBasis fuer den Bereich freigegeben
  });

  it("laesst ein freigegebenes, aktives Konto zu", async () => {
    const r = await pruefeKontenFreigabe(ksA, [freigegeben]);
    expect(r.ok).toBe(true);
  });

  it("lehnt ein nicht freigegebenes Konto ab", async () => {
    const fremd = await prisma.konto.create({ data: { nummer: "60000", bezeichnung: "Ohne Freigabe" } });
    const r = await pruefeKontenFreigabe(ksA, [fremd.id]);
    expect(r.ok).toBe(false);
  });

  it("lehnt ein deaktiviertes, aber freigegebenes Konto ab", async () => {
    const ks = await prisma.kostenstelle.findUnique({ where: { id: ksA }, select: { bereichId: true } });
    const inaktiv = await prisma.konto.create({ data: { nummer: "61000", bezeichnung: "Inaktiv", aktiv: false } });
    await prisma.bereichKonto.create({ data: { bereichId: ks!.bereichId, kontoId: inaktiv.id } });
    const r = await pruefeKontenFreigabe(ksA, [inaktiv.id]);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Test rot** — Run: `TEST_DATABASE_URL=... npx vitest run src/lib/kontoFreigabe.integration.test.ts`
Expected: FAIL (Modul `./kontoFreigabe.js` existiert nicht).

- [ ] **Step 3: Helfer implementieren** — `handkassen/backend/src/lib/kontoFreigabe.ts`:

```ts
import { prisma } from "./db.js";

// Prueft, dass jedes angegebene Konto existiert, aktiv und dem Bereich der
// Kostenstelle freigegeben ist. Ergebnis-Objekt statt Exception, damit die
// Routen sauber mit 400 antworten koennen.
export async function pruefeKontenFreigabe(
  kostenstelleId: number,
  kontoIds: number[]
): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const ks = await prisma.kostenstelle.findUnique({
    where: { id: kostenstelleId },
    select: { bereichId: true },
  });
  if (!ks) return { ok: false, fehler: "Kostenstelle nicht gefunden." };

  const eindeutig = [...new Set(kontoIds)];
  const konten = await prisma.konto.findMany({
    where: { id: { in: eindeutig } },
    select: {
      id: true,
      nummer: true,
      aktiv: true,
      bereiche: { where: { bereichId: ks.bereichId }, select: { bereichId: true } },
    },
  });
  const perId = new Map(konten.map((k) => [k.id, k]));

  for (const id of eindeutig) {
    const k = perId.get(id);
    if (!k) return { ok: false, fehler: `Konto (ID ${id}) nicht gefunden.` };
    if (!k.aktiv) return { ok: false, fehler: `Konto ${k.nummer} ist deaktiviert.` };
    if (k.bereiche.length === 0) {
      return { ok: false, fehler: `Konto ${k.nummer} ist fuer diesen Bereich nicht freigegeben.` };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Test grün** — Run: `TEST_DATABASE_URL=... npx vitest run src/lib/kontoFreigabe.integration.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**
```
git add handkassen/backend/src/lib/kontoFreigabe.ts handkassen/backend/src/lib/kontoFreigabe.integration.test.ts
git commit -m "Handkassen: Pruef-Helfer pruefeKontenFreigabe (Konto je Bereich)"
```

---

### Task 3: Gefilterte Kontenliste `GET /konten?kostenstelle=<id>`

**Files:**
- Modify: `handkassen/backend/src/routes/stammdaten.ts:25-31` (Route `GET /konten`)
- Create: `handkassen/backend/src/routes/konten.integration.test.ts`

**Interfaces:**
- Consumes: `darfKostenstelle` (bereits in `stammdaten.ts` importiert), Prisma `Konto.bereiche`.
- Produces: `GET /api/konten?kostenstelle=<id>` → nur aktive, dem Bereich der Kostenstelle freigegebene Konten (sortiert nach `nummer`); ohne Parameter 400; ohne Zugriff 403.

- [ ] **Step 1: Failing test** — `handkassen/backend/src/routes/konten.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../server.js";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("GET /konten?kostenstelle (Integration)", () => {
  let ksA = 0;

  beforeEach(async () => {
    await resetDb();
    const basis = await seedBasis();
    ksA = basis.ksA;
  });

  it("verlangt den kostenstelle-Parameter (400)", async () => {
    const agent = await alsAgent("admin");
    const r = await agent.get("/api/konten");
    expect(r.status).toBe(400);
  });

  it("liefert nur dem Bereich freigegebene, aktive Konten", async () => {
    const ks = await prisma.kostenstelle.findUnique({ where: { id: ksA }, select: { bereichId: true } });
    // nicht freigegebenes Konto
    await prisma.konto.create({ data: { nummer: "60000", bezeichnung: "Fremd" } });
    // freigegeben, aber inaktiv
    const inaktiv = await prisma.konto.create({ data: { nummer: "61000", bezeichnung: "Inaktiv", aktiv: false } });
    await prisma.bereichKonto.create({ data: { bereichId: ks!.bereichId, kontoId: inaktiv.id } });

    const agent = await alsAgent("admin");
    const r = await agent.get(`/api/konten?kostenstelle=${ksA}`);
    expect(r.status).toBe(200);
    const nummern = (r.body as { nummer: string }[]).map((k) => k.nummer);
    expect(nummern).toEqual(["50000"]); // nur das in seedBasis freigegebene aktive Konto
  });
});
```

- [ ] **Step 2: Test rot** — Run: `TEST_DATABASE_URL=... npx vitest run src/routes/konten.integration.test.ts`
Expected: FAIL (erster Test bekommt 200 statt 400; zweiter listet auch Fremd/Inaktiv).

- [ ] **Step 3: Route umbauen** — in `handkassen/backend/src/routes/stammdaten.ts` den Block `GET /konten` ersetzen:

```ts
// --- Kontenplan der gewaehlten Kostenstelle (nur deren Bereich freigegebene Konten) ---
stammdatenRouter.get("/konten", angemeldet, async (req, res) => {
  const kostenstelleId = Number(req.query.kostenstelle);
  if (!kostenstelleId) return res.status(400).json({ fehler: "kostenstelle erforderlich." });
  if (!(await darfKostenstelle(req.benutzer!, kostenstelleId))) {
    return res.status(403).json({ fehler: "Kein Zugriff auf diese Kostenstelle." });
  }
  const ks = await prisma.kostenstelle.findUnique({
    where: { id: kostenstelleId },
    select: { bereichId: true },
  });
  if (!ks) return res.status(404).json({ fehler: "Kostenstelle nicht gefunden." });

  const konten = await prisma.konto.findMany({
    where: { aktiv: true, bereiche: { some: { bereichId: ks.bereichId } } },
    orderBy: { nummer: "asc" },
  });
  res.json(konten);
});
```

- [ ] **Step 4: Test grün + Regression** — Run:
```
TEST_DATABASE_URL=... npx vitest run src/routes/konten.integration.test.ts
TEST_DATABASE_URL=... npx vitest run
```
Expected: neue Tests PASS; alle übrigen weiterhin grün.

- [ ] **Step 5: Commit**
```
git add handkassen/backend/src/routes/stammdaten.ts handkassen/backend/src/routes/konten.integration.test.ts
git commit -m "Handkassen: GET /konten liefert nur dem Kostenstellen-Bereich freigegebene Konten"
```

---

### Task 4: Serverseitige Durchsetzung beim Buchen und Korrigieren

**Files:**
- Modify: `handkassen/backend/src/routes/buchungen.ts` (Route `POST /` ~Zeile 173, Route `POST /:id/korrigieren` ~Zeile 337)
- Create: `handkassen/backend/src/routes/buchung-freigabe.integration.test.ts`

**Interfaces:**
- Consumes: `pruefeKontenFreigabe` aus Task 2; Helfer `buchungEingabe`, `alsAgent`, `seedBasis`.

- [ ] **Step 1: Failing test** — `handkassen/backend/src/routes/buchung-freigabe.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../server.js";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("Buchen: Konto-Freigabe je Bereich (Integration)", () => {
  let ksA = 0;
  let freigegeben = 0;
  let fremd = 0;

  beforeEach(async () => {
    await resetDb();
    const basis = await seedBasis();
    ksA = basis.ksA;
    freigegeben = basis.kontoId;
    const k = await prisma.konto.create({ data: { nummer: "60000", bezeichnung: "Fremd" } });
    fremd = k.id; // bewusst KEINE Freigabe
  });

  it("erlaubt Buchen mit freigegebenem Konto (201)", async () => {
    const agent = await alsAgent("erfasser");
    const r = await agent.post("/api/buchungen").send(buchungEingabe(ksA, freigegeben));
    expect(r.status).toBe(201);
  });

  it("lehnt Buchen mit nicht freigegebenem Konto ab (400) und legt nichts an", async () => {
    const agent = await alsAgent("erfasser");
    const r = await agent.post("/api/buchungen").send(buchungEingabe(ksA, fremd));
    expect(r.status).toBe(400);
    const anzahl = await prisma.buchung.count();
    expect(anzahl).toBe(0);
  });
});
```

- [ ] **Step 2: Test rot** — Run: `TEST_DATABASE_URL=... npx vitest run src/routes/buchung-freigabe.integration.test.ts`
Expected: FAIL (zweiter Test bekommt 201 statt 400).

- [ ] **Step 3: Import ergänzen** — in `handkassen/backend/src/routes/buchungen.ts` bei den Imports:

```ts
import { pruefeKontenFreigabe } from "../lib/kontoFreigabe.js";
```

- [ ] **Step 4: Durchsetzung in `POST /`** — direkt nach der fachlichen Validierung (nach dem `if (!pruef.ok) ...`-Block, vor der Beleg-Pflicht) einfügen:

```ts
  // 2c) Konten muessen dem Bereich der Kostenstelle freigegeben sein.
  const freigabe = await pruefeKontenFreigabe(
    eingabe.kostenstelleId,
    eingabe.positionen.map((p) => p.kontoId)
  );
  if (!freigabe.ok) return res.status(400).json({ fehler: freigabe.fehler });
```

- [ ] **Step 5: Durchsetzung in `POST /:id/korrigieren`** — nach dem `if (!pruef.ok) ...`-Block (vor der Beleg-Pflicht) denselben Block einfügen:

```ts
  // Konten muessen dem Bereich der (Ziel-)Kostenstelle freigegeben sein.
  const freigabe = await pruefeKontenFreigabe(
    eingabe.kostenstelleId,
    eingabe.positionen.map((p) => p.kontoId)
  );
  if (!freigabe.ok) return res.status(400).json({ fehler: freigabe.fehler });
```

- [ ] **Step 6: Test grün + Regression** — Run:
```
TEST_DATABASE_URL=... npx vitest run src/routes/buchung-freigabe.integration.test.ts
TEST_DATABASE_URL=... npx vitest run
```
Expected: neue Tests PASS; alle übrigen grün (dank seedBasis-Freigabe aus Task 1).

- [ ] **Step 7: Commit**
```
git add handkassen/backend/src/routes/buchungen.ts handkassen/backend/src/routes/buchung-freigabe.integration.test.ts
git commit -m "Handkassen: Buchen/Korrigieren erzwingt Konto-Freigabe fuer den Bereich"
```

---

### Task 5: Admin-API — Freigaben lesen und setzen

**Files:**
- Modify: `handkassen/backend/src/routes/admin.ts:155-186` (Routen `GET/POST/PUT /konten`, `kontoSchema`)
- Create: `handkassen/backend/src/routes/admin-konten.integration.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/admin/konten` → Konten inkl. `bereichIds: number[]`.
  - `POST /api/admin/konten` akzeptiert `{ nummer, bezeichnung, beschreibung?, anmerkung?, bereichIds?: number[] }`.
  - `PUT /api/admin/konten/:id` akzeptiert `{ bezeichnung, beschreibung?, anmerkung?, bereichIds?: number[] }`; `bereichIds` ersetzt die Freigabemenge vollständig.

- [ ] **Step 1: Failing test** — `handkassen/backend/src/routes/admin-konten.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../server.js";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("Admin Konten-Freigaben (Integration)", () => {
  let bereichId = 0;

  beforeEach(async () => {
    await resetDb();
    const basis = await seedBasis();
    const ks = await prisma.kostenstelle.findUnique({ where: { id: basis.ksA }, select: { bereichId: true } });
    bereichId = ks!.bereichId;
  });

  it("legt ein Konto mit Bereichs-Freigaben an", async () => {
    const agent = await alsAgent("admin");
    const r = await agent.post("/api/admin/konten").send({
      nummer: "70000", bezeichnung: "Neu", bereichIds: [bereichId],
    });
    expect(r.status).toBe(201);
    const anzahl = await prisma.bereichKonto.count({ where: { kontoId: r.body.id, bereichId } });
    expect(anzahl).toBe(1);
  });

  it("liefert bereichIds beim Auflisten", async () => {
    const agent = await alsAgent("admin");
    const liste = (await agent.get("/api/admin/konten")).body as { nummer: string; bereichIds: number[] }[];
    const testkonto = liste.find((k) => k.nummer === "50000");
    expect(testkonto?.bereichIds).toContain(bereichId);
  });

  it("ersetzt die Freigabemenge per PUT", async () => {
    const konto = await prisma.konto.findUnique({ where: { nummer: "50000" } });
    const agent = await alsAgent("admin");
    const r = await agent.put(`/api/admin/konten/${konto!.id}`).send({
      bezeichnung: "Testkonto", bereichIds: [],
    });
    expect(r.status).toBe(200);
    const anzahl = await prisma.bereichKonto.count({ where: { kontoId: konto!.id } });
    expect(anzahl).toBe(0);
  });
});
```

- [ ] **Step 2: Test rot** — Run: `TEST_DATABASE_URL=... npx vitest run src/routes/admin-konten.integration.test.ts`
Expected: FAIL (bereichIds/Freigaben werden nicht behandelt).

- [ ] **Step 3: `GET /konten` (Admin) mit bereichIds** — in `admin.ts` den Block ersetzen:

```ts
adminRouter.get("/konten", async (_req, res) => {
  const konten = await prisma.konto.findMany({
    orderBy: { nummer: "asc" },
    include: { bereiche: { select: { bereichId: true } } },
  });
  res.json(
    konten.map(({ bereiche, ...k }) => ({ ...k, bereichIds: bereiche.map((b) => b.bereichId) }))
  );
});
```

- [ ] **Step 4: Schema + `POST /konten`** — `kontoSchema` und POST ersetzen:

```ts
const kontoSchema = z.object({
  nummer: z.string().min(1),
  bezeichnung: z.string().min(1),
  beschreibung: z.string().optional(),
  anmerkung: z.string().optional(),
  bereichIds: z.array(z.number().int()).optional(),
});

adminRouter.post("/konten", async (req, res) => {
  const parse = kontoSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  const { bereichIds, ...kontoDaten } = parse.data;
  const vorhanden = await prisma.konto.findUnique({ where: { nummer: kontoDaten.nummer } });
  if (vorhanden) return res.status(409).json({ fehler: "Kontonummer bereits vorhanden." });

  const konto = await prisma.$transaction(async (tx) => {
    const k = await tx.konto.create({ data: kontoDaten });
    if (bereichIds?.length) {
      await tx.bereichKonto.createMany({
        data: bereichIds.map((bereichId) => ({ bereichId, kontoId: k.id })),
      });
    }
    return k;
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "konto.erstellt", entitaet: "konto", entitaetId: konto.id, neueWerte: { ...konto, bereichIds: bereichIds ?? [] } });
  res.status(201).json({ ...konto, bereichIds: bereichIds ?? [] });
});
```

- [ ] **Step 5: `PUT /konten/:id`** — ersetzen:

```ts
adminRouter.put("/konten/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { bezeichnung, beschreibung, anmerkung, bereichIds } = req.body ?? {};
  const konto = await prisma.$transaction(async (tx) => {
    const k = await tx.konto.update({
      where: { id },
      data: { bezeichnung, beschreibung, anmerkung },
    });
    if (Array.isArray(bereichIds)) {
      // Freigabemenge vollstaendig neu setzen.
      await tx.bereichKonto.deleteMany({ where: { kontoId: id } });
      if (bereichIds.length) {
        await tx.bereichKonto.createMany({
          data: bereichIds.map((bereichId: number) => ({ bereichId, kontoId: id })),
        });
      }
    }
    return k;
  });
  await audit({ benutzerId: req.benutzer!.id, aktion: "konto.bearbeitet", entitaet: "konto", entitaetId: id, neueWerte: { ...konto, bereichIds } });
  res.json({ ...konto, bereichIds: Array.isArray(bereichIds) ? bereichIds : undefined });
});
```

- [ ] **Step 6: Test grün + Regression** — Run:
```
TEST_DATABASE_URL=... npx vitest run src/routes/admin-konten.integration.test.ts
TEST_DATABASE_URL=... npx vitest run
```
Expected: neue Tests PASS; übrige grün.

- [ ] **Step 7: Commit**
```
git add handkassen/backend/src/routes/admin.ts handkassen/backend/src/routes/admin-konten.integration.test.ts
git commit -m "Handkassen: Admin-API verwaltet Konto-Bereich-Freigaben (GET/POST/PUT)"
```

---

### Task 6: Buchungsmaske lädt Konten gefiltert

**Files:**
- Modify: `handkassen/frontend/src/components/BuchungsFormular.tsx:75-76` (Konten-Fetch)

**Interfaces:**
- Consumes: `GET /api/konten?kostenstelle=<id>` aus Task 3. `kostenstelleId` ist bereits Prop.

- [ ] **Step 1: Fetch auf die Kostenstelle beziehen** — in `BuchungsFormular.tsx` den Konten-Fetch aus dem bestehenden `useEffect` herauslösen und von `kostenstelleId` abhängig machen. Konkret die Zeile

```ts
    api.get<Konto[]>("/konten").then(setKonten).catch(() => {});
```
ersetzen durch einen eigenen Effekt (oberhalb des bestehenden `useEffect`, der Steuersätze lädt):

```ts
  useEffect(() => {
    if (!kostenstelleId) { setKonten([]); return; }
    api.get<Konto[]>(`/konten?kostenstelle=${kostenstelleId}`).then(setKonten).catch(() => setKonten([]));
  }, [kostenstelleId]);
```
Die verbleibende `api.get`-Zeile für die Steuersätze bleibt im ursprünglichen Effekt.

- [ ] **Step 2: Build prüfen** — Run (aus `handkassen/frontend`): `npm run build`
Expected: Build erfolgreich, keine TypeScript-Fehler.

- [ ] **Step 3: Commit**
```
git add handkassen/frontend/src/components/BuchungsFormular.tsx
git commit -m "Handkassen: Buchungsmaske laedt nur dem Bereich freigegebene Konten"
```

---

### Task 7: Admin-Oberfläche — Bereichs-Mehrfachauswahl je Konto

**Files:**
- Modify: `handkassen/frontend/src/pages/AdminSeite.tsx:514-636` (Interface `Konto`, `KontenTab`)

**Interfaces:**
- Consumes: `GET /api/admin/bereiche` (liefert `Stammwert[]` mit `{ id, bezeichnung, aktiv }`, wie im KostenstellenTab genutzt), `GET/POST/PUT /api/admin/konten` mit `bereichIds` aus Task 5.

- [ ] **Step 1: Interface + State erweitern** — in `AdminSeite.tsx` das `Konto`-Interface und `KontenTab`-State anpassen:

```ts
interface Konto { id: number; nummer: string; bezeichnung: string; beschreibung?: string; anmerkung?: string; aktiv: boolean; bereichIds: number[]; }
```
In `KontenTab()` den State ergänzen:
```ts
  const [bereiche, setBereiche] = useState<Stammwert[]>([]);
  const [neu, setNeu] = useState<{ nummer: string; bezeichnung: string; beschreibung: string; anmerkung: string; bereichIds: number[] }>({ nummer: "", bezeichnung: "", beschreibung: "", anmerkung: "", bereichIds: [] });
```
Und den Bearbeiten-Entwurf um Freigaben erweitern:
```ts
  const [entwurf, setEntwurf] = useState<{ bezeichnung: string; beschreibung: string; anmerkung: string; bereichIds: number[] }>({ bezeichnung: "", beschreibung: "", anmerkung: "", bereichIds: [] });
```

- [ ] **Step 2: Bereiche laden + Aktionen anpassen** — `laden()`, `anlegen()`, `bearbeitenStarten()`, `bearbeitenSpeichern()`:

```ts
  function laden() {
    api.get<Konto[]>("/admin/konten").then(setListe).catch(() => {});
    api.get<Stammwert[]>("/admin/bereiche").then(setBereiche).catch(() => {});
  }
```
```ts
  async function anlegen() {
    setFehler("");
    try {
      await api.post("/admin/konten", neu);
      setNeu({ nummer: "", bezeichnung: "", beschreibung: "", anmerkung: "", bereichIds: [] });
      laden();
    } catch (e) { setFehler((e as Error).message); }
  }
```
```ts
  function bearbeitenStarten(k: Konto) {
    setFehler("");
    setBearbeiteId(k.id);
    setEntwurf({ bezeichnung: k.bezeichnung, beschreibung: k.beschreibung ?? "", anmerkung: k.anmerkung ?? "", bereichIds: k.bereichIds });
  }
```
```ts
  async function bearbeitenSpeichern(id: number) {
    setFehler("");
    try {
      await api.put(`/admin/konten/${id}`, {
        bezeichnung: entwurf.bezeichnung,
        beschreibung: entwurf.beschreibung,
        anmerkung: entwurf.anmerkung,
        bereichIds: entwurf.bereichIds,
      });
      setBearbeiteId(null);
      laden();
    } catch (e) { setFehler((e as Error).message); }
  }
```
Direkt vor dem `return (` eine kleine Umschalt-Hilfe und die aktiven Bereiche ergänzen:
```ts
  const aktiveBereiche = bereiche.filter((b) => b.aktiv);
  function toggle(ids: number[], id: number): number[] {
    return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  }
```

- [ ] **Step 3: Freigabe-Auswahl im Anlege-Formular** — im „Neues Konto anlegen"-Grid vor dem „Anlegen"-Button eine Bereichs-Auswahl (Checkboxen) einfügen:

```tsx
          <div className="col-span-5">
            <label className="block text-sm font-medium mb-1">Freigegeben für Bereiche</label>
            <div className="flex flex-wrap gap-3">
              {aktiveBereiche.map((b) => (
                <label key={b.id} className="inline-flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={neu.bereichIds.includes(b.id)}
                    onChange={() => setNeu({ ...neu, bereichIds: toggle(neu.bereichIds, b.id) })} />
                  {b.bezeichnung}
                </label>
              ))}
            </div>
          </div>
```

- [ ] **Step 4: Spalte „Bereiche" in der Tabelle** — im `thead` eine Spalte ergänzen und im `tbody` je Zeile die Freigaben anzeigen bzw. im Edit-Modus als Checkboxen. `thead`:

```tsx
              <th className="py-2">Nummer</th><th>Bezeichnung</th><th>Beschreibung</th><th>Bereiche</th><th>Status</th><th></th>
```
Neue Zelle (zwischen Beschreibung/Anmerkung-Zellen und Status-Zelle einfügen; ersetzt die bisherige „Anmerkung"-Spalte durch „Bereiche", Anmerkung entfällt in der Übersicht):

```tsx
                <td className="text-slate-500">
                  {imEdit ? (
                    <div className="flex flex-wrap gap-2">
                      {aktiveBereiche.map((b) => (
                        <label key={b.id} className="inline-flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={entwurf.bereichIds.includes(b.id)}
                            onChange={() => setEntwurf({ ...entwurf, bereichIds: toggle(entwurf.bereichIds, b.id) })} />
                          {b.bezeichnung}
                        </label>
                      ))}
                    </div>
                  ) : (
                    k.bereichIds.length
                      ? bereiche.filter((b) => k.bereichIds.includes(b.id)).map((b) => b.bezeichnung).join(", ")
                      : <span className="text-amber-700">keine Freigabe</span>
                  )}
                </td>
```
Die bisherige separate „Anmerkung"-Zelle im `tbody` und der `<th>Anmerkung</th>` werden entfernt (Anmerkung bleibt über den Bearbeiten-Dialog/Beschreibung erhalten; die Übersicht zeigt stattdessen die Bereiche). Die Bezeichnungs- und Beschreibungs-Zellen bleiben unverändert.

- [ ] **Step 5: Build prüfen** — Run (aus `handkassen/frontend`): `npm run build`
Expected: Build erfolgreich, keine TypeScript-Fehler.

- [ ] **Step 6: Commit**
```
git add handkassen/frontend/src/pages/AdminSeite.tsx
git commit -m "Handkassen: Admin - Konten je Bereich freigeben (Mehrfachauswahl + Anzeige)"
```

---

### Task 8: Seed-Demo-Freigaben

**Files:**
- Modify: `handkassen/backend/prisma/seed.ts` (nach Konten- und Bereichs-Seed)

**Interfaces:**
- Consumes: geseedete Konten (Feld `nummer`) und Bereiche (`VBW`, `GVB`, `TBW`).

- [ ] **Step 1: Freigaben seeden** — in `handkassen/backend/prisma/seed.ts` nach dem Anlegen der Bereiche (nach der Schleife, die `bereiche` upsertet) einfügen:

```ts
  // Demo-Freigaben: die meisten Konten fuer alle Bereiche, mindestens eines
  // bewusst nur fuer einen Bereich, damit der n:m-Fall abgedeckt ist.
  const alleBereiche = await prisma.bereich.findMany({ select: { id: true, bezeichnung: true } });
  const alleKonten = await prisma.konto.findMany({ select: { id: true, nummer: true } });
  for (const k of alleKonten) {
    const zielBereiche =
      k.nummer === "28970"
        ? alleBereiche.filter((b) => b.bezeichnung === "VBW") // Beispiel: nur VBW
        : alleBereiche;
    for (const b of zielBereiche) {
      await prisma.bereichKonto.upsert({
        where: { bereichId_kontoId: { bereichId: b.id, kontoId: k.id } },
        update: {},
        create: { bereichId: b.id, kontoId: k.id },
      });
    }
  }
  console.log(`Demo-Konto-Freigaben gesetzt.`);
```

- [ ] **Step 2: Seed lokal ausführen (gegen Entwicklungs-DB)** — Run (aus `handkassen/backend`):
```
npx prisma db seed
```
Expected: läuft ohne Fehler; „Demo-Konto-Freigaben gesetzt."

- [ ] **Step 3: Commit**
```
git add handkassen/backend/prisma/seed.ts
git commit -m "Handkassen: Seed vergibt Demo-Konto-Freigaben je Bereich (inkl. Mehrfach)"
```

---

## Abschluss (nach allen Tasks)

- [ ] **Gesamter Testlauf** — Run (aus `handkassen/backend`): `TEST_DATABASE_URL=... npx vitest run` → alles grün.
- [ ] **Typecheck** — Run: `npx tsc --noEmit` (backend) und `npm run build` (frontend).
- [ ] Danach: `superpowers:finishing-a-development-branch` (Merge/Deploy nach Freigabe). **Rollout-Hinweis in Erinnerung rufen:** Beim Deploy wird die Migration angewandt und gibt alle Bestandskonten für alle Bereiche frei (nichts bricht). Das Ausmisten je Bereich erfolgt danach im Admin unter „Konten".

## Self-Review (Plan gegen Spec)

- **Spec §Datenmodell** → Task 1 (BereichKonto, Relationen, `@@map`).
- **Spec §API — Buchungsmaske** → Task 3 (`GET /konten?kostenstelle`).
- **Spec §API — Admin** → Task 5 (GET liefert bereichIds; POST/PUT setzen Freigaben als Gesamtmenge).
- **Spec §Serverseitige Durchsetzung** → Task 2 (Helfer) + Task 4 (beide Routen).
- **Spec §Verwaltung (Frontend)** → Task 7 (Mehrfachauswahl + Anzeige, „keine Freigabe" sichtbar).
- **Spec §BMD/Sonderkonten** → keine Code-Änderung (bewusst); Nummern global eindeutig (unverändert).
- **Spec §Migration all-to-all** → Task 1 Step 3 (CROSS JOIN INSERT) + Abschluss-Hinweis.
- **Spec §Seed** → Task 8 (inkl. Mehrfach-Freigabe-Fall).
- **Spec §Tests** → Tasks 2–5 (Freigabe-Helfer, gefilterte Liste, Durchsetzung Buchen/Korrigieren, Admin-Freigaben, global-eindeutige Nummer via bestehendem 409).
- **Typkonsistenz:** `pruefeKontenFreigabe(number, number[])`, `bereichIds: number[]`, Relationen `Konto.bereiche`/`Bereich.konten` durchgängig gleich benannt.
