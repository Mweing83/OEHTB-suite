# Handkassen: Dezimale Steuersätze & manuelle Start-Belegnummer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Steuersätze im Handkassen-Modul mit optionaler Nachkommastelle (z. B. 4,9 %) darstellen und speichern, und je Kassa eine manuell setzbare Start-Belegnummer für das Umstellungsjahr ermöglichen.

**Architecture:** Zwei unabhängige, rückwärtskompatible Änderungen. (1) Steuersatz-Felder wechseln von `Int` auf `Decimal(5,1)`; ein neuer reiner Anzeige-Helper `formatProzent` blendet Null-Nachkommastellen aus; das Backend wandelt `Decimal` an den Response-Grenzen in `number`, damit der Frontend-Vertrag (Zahlen) unverändert bleibt. (2) Zwei neue optionale Felder an `Kostenstelle` (`belegStartnummer`, `belegStartJahr`) heben die Untergrenze der laufenden Belegnummer im Umstellungsjahr an — sie können nie Doppelnummern erzeugen.

**Tech Stack:** React + Vite + TypeScript (Frontend), Node + Express + TypeScript ESM (Backend), Prisma + PostgreSQL, vitest (Backend-Tests vorhanden; Frontend-Tests werden in Task 1 minimal eingerichtet).

## Global Constraints

- Alles deutschsprachig (Bezeichner, Kommentare, UI). Commits mit ASCII-Umlauten (ae/oe/ue).
- Backend ist ESM: relative Imports **immer** mit `.js`-Endung.
- Geld immer als Ganzzahl in Cent; niemals Float für Beträge.
- Prisma-Migrationen werden bei Container-Start automatisch angewandt (`migrate deploy`). Für jede Schemaänderung MUSS eine Migration erzeugt werden.
- Nur kostenfreie/Open-Source-Bibliotheken; alles lokal lauffähig; maximal schlank.
- Bestehende Security-Boot-Guards nicht abschwächen.
- Steuersatz-Genauigkeit: genau **eine** Nachkommastelle (`Decimal(5,1)`), server- und clientseitig auf 1 Stelle gerundet.
- Start-Belegnummer gilt **nur** für das Umstellungsjahr (`belegStartJahr`); im Folgejahr beginnt die Nummerierung wieder bei 1.
- Der Startwert hebt nur die Untergrenze an (`Math.max`), nie rückwärts.

### Testumgebung (Backend)
- Unit-Tests (ohne DB): `npm test` im Ordner `handkassen/backend`.
- Integrationstests brauchen eine Test-DB. Vorbereiten (einmalig nach Schemaänderung): `npm run test:db-vorbereiten` (macht `prisma db push` auf `handkassen_test`). Ausführen: `npm run test:integration`.
- Integrationstests sind mit `const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;` bewacht — ohne `TEST_DATABASE_URL` werden sie übersprungen.
- Migrationen erzeugen: laufende Dev-DB nötig (`docker compose up -d` im `handkassen`-Ordner startet nur Postgres), dann `npx prisma migrate dev --name <name>` im `handkassen/backend`.

---

### Task 1: Anzeige-Helper `formatProzent` (+ minimale Frontend-Test-Einrichtung)

Reiner Formatierungs-Helper, unabhängig testbar. Das Frontend hat noch keinen Test-Runner; hier wird vitest minimal ergänzt (nutzt die vorhandene `vite.config.ts` automatisch).

**Files:**
- Modify: `handkassen/frontend/package.json` (devDependency `vitest`, Script `test`)
- Modify: `handkassen/frontend/src/lib/geld.ts`
- Test: `handkassen/frontend/src/lib/geld.test.ts` (neu)

**Interfaces:**
- Produces: `export function formatProzent(satz: number): string` — `20 → "20"`, `13 → "13"`, `10 → "10"`, `0 → "0"`, `4.9 → "4,9"`.

- [ ] **Step 1: vitest als devDependency ergänzen**

Im Ordner `handkassen/frontend`:

```bash
npm install -D vitest
```

- [ ] **Step 2: Test-Script in `handkassen/frontend/package.json` ergänzen**

Im `"scripts"`-Block hinzufügen (neben `dev`/`build`/`preview`):

```json
    "test": "vitest run"
```

- [ ] **Step 3: Den fehlschlagenden Test schreiben**

`handkassen/frontend/src/lib/geld.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatProzent } from "./geld.js";

describe("formatProzent", () => {
  it("zeigt ganze Saetze ohne Nachkommastelle", () => {
    expect(formatProzent(20)).toBe("20");
    expect(formatProzent(13)).toBe("13");
    expect(formatProzent(10)).toBe("10");
    expect(formatProzent(0)).toBe("0");
  });

  it("zeigt gebrochene Saetze mit einer Nachkommastelle und de-AT-Komma", () => {
    expect(formatProzent(4.9)).toBe("4,9");
  });
});
```

- [ ] **Step 4: Test ausführen und Fehlschlag bestätigen**

Run (in `handkassen/frontend`): `npm test`
Expected: FAIL — `formatProzent` ist nicht exportiert.

- [ ] **Step 5: `formatProzent` implementieren**

In `handkassen/frontend/src/lib/geld.ts` am Ende anfügen:

```ts
// Formatiert einen Steuersatz fuer die Anzeige. Ganze Werte ohne
// Nachkommastelle, gebrochene mit de-AT-Komma und einer Nachkommastelle.
// 20 -> "20", 13 -> "13", 4.9 -> "4,9", 0 -> "0".
export function formatProzent(satz: number): string {
  return Number.isInteger(satz)
    ? String(satz)
    : satz.toLocaleString("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
```

- [ ] **Step 6: Test ausführen und Erfolg bestätigen**

Run (in `handkassen/frontend`): `npm test`
Expected: PASS (beide Tests grün).

- [ ] **Step 7: Commit**

```bash
git add handkassen/frontend/package.json handkassen/frontend/package-lock.json handkassen/frontend/src/lib/geld.ts handkassen/frontend/src/lib/geld.test.ts
git commit -F- <<'EOF'
Handkassen: formatProzent-Helper + Frontend-Test-Einrichtung (vitest)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 2: Steuersätze auf `Decimal(5,1)` umstellen (Backend)

Datenmodell, Validierung, Serialisierung und MwSt-Arithmetik auf dezimale Sätze umstellen. Das Frontend erhält weiterhin `number` (Backend wandelt `Decimal` an den Grenzen um).

**Files:**
- Modify: `handkassen/backend/prisma/schema.prisma` (Zeilen 164-171 `Steuersatz`, Zeile 223 `BuchungsPosition.steuersatz`)
- Create: `handkassen/backend/prisma/migrations/<zeitstempel>_steuersatz_dezimal/migration.sql` (via `prisma migrate dev`)
- Modify: `handkassen/backend/src/lib/buchungslogik.ts` (neuer Serialisierungs-Helper)
- Modify: `handkassen/backend/src/routes/buchungen.ts` (Zeilen 173, 343 `.toNumber()`; Responses 156, 279, 467; Arithmetik unberührt)
- Modify: `handkassen/backend/src/routes/stammdaten.ts` (GET `/steuersaetze`, Zeilen 45-51)
- Modify: `handkassen/backend/src/routes/admin.ts` (GET `/steuersaetze` 228-231; `steuerSchema` 233-236; POST 238-246)
- Modify: `handkassen/backend/src/routes/berichte.ts` (Zeilen 195, 330: Arithmetik-Argument coercen)
- Modify: `handkassen/backend/src/routes/export.ts` (Zeilen 114, 185: Arithmetik-Argument coercen)
- Test: `handkassen/backend/src/lib/buchungslogik.test.ts` (dezimaler Satz erlaubt), `handkassen/backend/src/lib/steuer-dezimal.test.ts` (neu, MwSt mit 4,9 %)

**Interfaces:**
- Consumes: `belegnummerFormat`, `buchungValidieren` (unverändert), `enthalteneSteuerCent(bruttoCent: number, steuersatz: number)` aus `lib/pdf.js` (Signatur bleibt `number`).
- Produces: `export function buchungFuerAusgabe<T extends { positionen: Array<{ steuersatz: unknown }> }>(b: T): T` — ersetzt `positionen[].steuersatz` durch `Number(...)`.

**Scope-Grenze (bewusst):** Die maschinen-/büronahen Backend-Ausgaben (BMD-Export `export.ts`, CSV/PDF-Berichts-Strings `${p.steuersatz}%`) behalten die numerische Darstellung (`Decimal.toString()` liefert `"20"` bzw. `"4.9"`). Nur die drei Frontend-Anzeigestellen (Task 3) verwenden das de-AT-Komma. Das vermeidet Formatänderungen an bestehenden Export-/Berichtsformaten.

- [ ] **Step 1: Dezimalen Steuersatz in der Validierung absichern (fehlschlagender Test)**

In `handkassen/backend/src/lib/buchungslogik.test.ts` einen Test ergänzen (Datei nutzt bereits vitest + `buchungValidieren`):

```ts
it("erlaubt einen dezimalen Steuersatz (4,9 %), wenn er freigegeben ist", () => {
  const eingabe = {
    betragCent: 1000,
    belegdatum: "2026-05-15",
    typ: "ausgang" as const,
    kostenstelleId: 1,
    positionen: [{ betragCent: 1000, steuersatz: 4.9, kontoId: 1 }],
  };
  expect(buchungValidieren(eingabe, [0, 4.9, 20]).ok).toBe(true);
});
```

- [ ] **Step 2: Test ausführen — er ist bereits GRÜN**

Run (in `handkassen/backend`): `npm test -- buchungslogik`
Expected: PASS. `buchungValidieren` prüft `erlaubteSteuersaetze.includes(pos.steuersatz)` und verlangt für `steuersatz` keine Ganzzahl — der dezimale Satz ist bereits gültig. Dieser Test fixiert das Verhalten (Regressionsschutz), bevor der Typ in der DB wechselt.

- [ ] **Step 3: MwSt-Berechnung mit dezimalem Satz (fehlschlagender Test)**

Neue Datei `handkassen/backend/src/lib/steuer-dezimal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { enthalteneSteuerCent } from "./pdf.js";

describe("enthalteneSteuerCent mit dezimalem Satz", () => {
  it("rechnet 4,9 % korrekt auf den Cent", () => {
    // 1049 Cent brutto bei 4,9 %: netto 1049/1.049 = 1000 -> Steueranteil 49 Cent.
    expect(enthalteneSteuerCent(1049, 4.9)).toBe(49);
  });

  it("liefert bei 0 % keinen Steueranteil", () => {
    expect(enthalteneSteuerCent(1000, 0)).toBe(0);
  });
});
```

- [ ] **Step 4: Test ausführen und Erfolg bestätigen**

Run (in `handkassen/backend`): `npm test -- steuer-dezimal`
Expected: PASS. `enthalteneSteuerCent` in `lib/pdf.ts` rechnet bereits generisch mit `number`; der Test sichert die dezimale Rechnung ab. (Schlägt der Test fehl, ist die Formel zu prüfen — nicht der Test anzupassen.)

- [ ] **Step 5: Schema auf `Decimal(5,1)` umstellen**

In `handkassen/backend/prisma/schema.prisma`:

`Steuersatz` (Zeilen 162-171) — Kommentar und Feldtyp:

```prisma
// Anpassbare Mehrwertsteuersätze (Stammdaten, durch Admin pflegbar).
// prozent ist der Satz mit bis zu einer Nachkommastelle (z. B. 0, 10, 20, 4.9).
model Steuersatz {
  id      Int     @id @default(autoincrement())
  prozent Decimal @unique @db.Decimal(5, 1)
  bezeichnung String   // z. B. "Normalsatz 20 %"
  aktiv   Boolean @default(true)

  @@map("steuersatz")
}
```

`BuchungsPosition.steuersatz` (Zeile 223):

```prisma
  steuersatz  Decimal @db.Decimal(5, 1) // Satz mit bis zu einer Nachkommastelle
```

- [ ] **Step 6: Migration erzeugen**

Dev-DB starten (falls nicht laufend): im Ordner `handkassen` `docker compose up -d`.
Dann im Ordner `handkassen/backend`:

```bash
npx prisma migrate dev --name steuersatz_dezimal
```

Erwartung: erzeugt `prisma/migrations/<zeitstempel>_steuersatz_dezimal/migration.sql` mit `ALTER TABLE ... ALTER COLUMN "prozent"/"steuersatz" ... TYPE DECIMAL(5,1)` und generiert den Prisma-Client neu. Bestehende Ganzzahlen werden verlustfrei zu `x.0` gecastet.

- [ ] **Step 7: Validierungs-Fetches auf `number` mappen**

In `handkassen/backend/src/routes/buchungen.ts` an **zwei** Stellen (Zeile 173 im POST-Pfad und Zeile 343 im Korrektur-Pfad) den Decimal-Satz in `number` wandeln, sonst schlägt `erlaubteSteuersaetze.includes(pos.steuersatz)` fehl (Decimal-Objekt ≠ number):

```ts
  const erlaubt = aktiveSteuersaetze.map((s) => s.prozent.toNumber());
```

- [ ] **Step 8: Serialisierungs-Helper `buchungFuerAusgabe` anlegen**

In `handkassen/backend/src/lib/buchungslogik.ts` am Ende anfügen:

```ts
// Wandelt die dezimalen Steuersaetze einer Buchung (Prisma-Decimal) in JS-Zahlen,
// damit das Frontend wie gewohnt mit number arbeitet. Number(Decimal) nutzt valueOf.
export function buchungFuerAusgabe<T extends { positionen: Array<{ steuersatz: unknown }> }>(b: T): T {
  return {
    ...b,
    positionen: b.positionen.map((p) => ({ ...p, steuersatz: Number(p.steuersatz) })),
  };
}
```

- [ ] **Step 9: Serialisierung an den drei Buchungs-Responses anwenden**

In `handkassen/backend/src/routes/buchungen.ts`:

- Import (Zeile 8) um `buchungFuerAusgabe` erweitern:

```ts
import { buchungValidieren, saldoWirkung, belegnummerFormat, buchungFuerAusgabe, type BuchungEingabe } from "../lib/buchungslogik.js";
```

- Liste (Zeile 156): `res.json(buchungen);` → `res.json(buchungen.map(buchungFuerAusgabe));`
- POST-Response (Zeile 279): `res.status(201).json(ergebnis);` → `res.status(201).json(buchungFuerAusgabe(ergebnis));`
- Korrektur-Response (Zeile 467): `res.status(201).json(ergebnis);` → `res.status(201).json(buchungFuerAusgabe(ergebnis));`

- [ ] **Step 10: `/steuersaetze`-Endpunkte auf `number` serialisieren**

In `handkassen/backend/src/routes/stammdaten.ts` (GET `/steuersaetze`, Zeilen 45-51):

```ts
stammdatenRouter.get("/steuersaetze", angemeldet, async (_req, res) => {
  const saetze = await prisma.steuersatz.findMany({
    where: { aktiv: true },
    orderBy: { prozent: "asc" },
  });
  res.json(saetze.map((s) => ({ ...s, prozent: s.prozent.toNumber() })));
});
```

In `handkassen/backend/src/routes/admin.ts` (GET `/steuersaetze`, Zeilen 228-231):

```ts
adminRouter.get("/steuersaetze", async (_req, res) => {
  const saetze = await prisma.steuersatz.findMany({ orderBy: { prozent: "asc" } });
  res.json(saetze.map((s) => ({ ...s, prozent: s.prozent.toNumber() })));
});
```

- [ ] **Step 11: Admin-Schema und POST auf dezimale Sätze umstellen**

In `handkassen/backend/src/routes/admin.ts`:

`steuerSchema` (Zeilen 233-236) — `.int()` entfernen:

```ts
const steuerSchema = z.object({
  prozent: z.number().min(0).max(100),
  bezeichnung: z.string().min(1),
});
```

POST `/steuersaetze` (Zeilen 238-246) — auf eine Nachkommastelle runden und `number` zurückgeben:

```ts
adminRouter.post("/steuersaetze", async (req, res) => {
  const parse = steuerSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ fehler: "Ungültige Eingabe." });
  // Auf genau eine Nachkommastelle runden (Decimal(5,1)).
  const prozent = Math.round(parse.data.prozent * 10) / 10;
  const vorhanden = await prisma.steuersatz.findUnique({ where: { prozent } });
  if (vorhanden) return res.status(409).json({ fehler: "Dieser Satz existiert bereits." });
  const satz = await prisma.steuersatz.create({ data: { prozent, bezeichnung: parse.data.bezeichnung } });
  await audit({ benutzerId: req.benutzer!.id, aktion: "steuersatz.erstellt", entitaet: "steuersatz", entitaetId: satz.id, neueWerte: satz });
  res.status(201).json({ ...satz, prozent: satz.prozent.toNumber() });
});
```

- [ ] **Step 12: MwSt-Arithmetik in Berichten/Export gegen Decimal absichern**

In `handkassen/backend/src/routes/berichte.ts` das Steuersatz-Argument der Rechnung in `number` wandeln (Zeilen 195 und 330):

```ts
    const mwst = b.positionen.reduce((s, p) => s + enthalteneSteuerCent(p.betragCent, Number(p.steuersatz)), 0);
```

In `handkassen/backend/src/routes/export.ts` ebenso (Zeilen 114 und 185):

```ts
      const { nettoCent, steuerCent } = nettoUndSteuer(p.betragCent, Number(p.steuersatz));
```

```ts
        (s, p) => s + nettoUndSteuer(p.betragCent, Number(p.steuersatz)).steuerCent,
```

(Die String-Interpolationen `${p.steuersatz}%` und `String(p.steuersatz)` bleiben unverändert — `Decimal.toString()` liefert `"20"`/`"4.9"`.)

- [ ] **Step 13: Seed-Kommentar/Werte prüfen (keine Änderung der Zahlen)**

`handkassen/backend/prisma/seed.ts` (Zeilen 45-51) seedet 0/10/20 als Ganzzahlen — mit `Decimal(5,1)` weiterhin gültig (Prisma akzeptiert `number` für Decimal-Felder). **Keine Änderung nötig.** Nur verifizieren, dass der Seed unverändert lauffähig bleibt (Step 14).

- [ ] **Step 14: Backend-Unit-Tests ausführen**

Run (in `handkassen/backend`): `npm test`
Expected: PASS (inkl. der neuen `buchungslogik`- und `steuer-dezimal`-Tests). Unit-Tests brauchen keine DB.

- [ ] **Step 15: Test-DB synchronisieren und Integrationstests ausführen**

Run (in `handkassen/backend`):

```bash
npm run test:db-vorbereiten
npm run test:integration
```

Expected: PASS. Insbesondere `buchungen.integration.test.ts` bleibt grün — der Satz 13 ist bei `seedBasis` (0/10/20) weiterhin nicht aktiv und wird abgelehnt; die erste Belegnummer bleibt `"2026-1000-01"`. `r.body.positionen[].steuersatz` ist jetzt `number` statt `Int` (kein Test prüft den Typ).

- [ ] **Step 16: Commit**

```bash
git add handkassen/backend/prisma/schema.prisma handkassen/backend/prisma/migrations handkassen/backend/src/lib/buchungslogik.ts handkassen/backend/src/lib/buchungslogik.test.ts handkassen/backend/src/lib/steuer-dezimal.test.ts handkassen/backend/src/routes/buchungen.ts handkassen/backend/src/routes/stammdaten.ts handkassen/backend/src/routes/admin.ts handkassen/backend/src/routes/berichte.ts handkassen/backend/src/routes/export.ts
git commit -F- <<'EOF'
Handkassen: Steuersaetze auf Decimal(5,1) - Backend, Validierung, Serialisierung

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 3: Dezimale Steuersätze im Frontend anzeigen & eingeben

Die drei Anzeigestellen nutzen `formatProzent`; die Admin-Anlage akzeptiert „4,9"/„4.9".

**Files:**
- Modify: `handkassen/frontend/src/components/BuchungsFormular.tsx` (Import Zeile 3; Dropdown Zeile 261)
- Modify: `handkassen/frontend/src/pages/BuchungenSeite.tsx` (Import von `geld.js`; Zeile 313)
- Modify: `handkassen/frontend/src/pages/AdminSeite.tsx` (Import von `geld.js`; Tabelle Zeile 497; Parse Zeile 450; Placeholder Zeile 472)

**Interfaces:**
- Consumes: `formatProzent(satz: number): string` aus `../lib/geld.js` (Task 1). Alle `prozent`/`steuersatz`-Werte kommen dank Task 2 als `number` an.

- [ ] **Step 1: Buchungsformular-Dropdown formatieren**

In `handkassen/frontend/src/components/BuchungsFormular.tsx`:

Import (Zeile 3) um `formatProzent` erweitern:

```ts
import { euroStringZuCent, formatCent, formatProzent } from "../lib/geld.js";
```

Dropdown-Label (Zeile 261) — `value` bleibt der numerische Rohwert:

```tsx
                <option key={s.id} value={s.prozent}>{formatProzent(s.prozent)} %</option>
```

- [ ] **Step 2: Buchungsliste formatieren**

In `handkassen/frontend/src/pages/BuchungenSeite.tsx`:

Den bestehenden Import aus `../lib/geld.js` um `formatProzent` erweitern (die Datei importiert bereits `formatCent` von dort):

```ts
import { formatCent, formatProzent } from "../lib/geld.js";
```

Zeile 313:

```tsx
                        {b.positionen.map((p) => `${p.konto.nummer} (${formatProzent(p.steuersatz)}%)`).join(", ")}
```

- [ ] **Step 3: Admin-Tabelle formatieren**

In `handkassen/frontend/src/pages/AdminSeite.tsx`:

Den bestehenden Import aus `../lib/geld.js` um `formatProzent` erweitern (die Datei importiert bereits `formatCent`/`euroStringZuCent` von dort). Zeile 497:

```tsx
                <td className="py-2">{formatProzent(s.prozent)} %</td>
```

- [ ] **Step 4: Admin-Anlage: dezimale Eingabe parsen**

In `handkassen/frontend/src/pages/AdminSeite.tsx`, Funktion `anlegen` im `SteuersaetzeTab` (Zeilen 448-459), `parseInt` durch dezimales Parsen mit Rundung auf eine Nachkommastelle ersetzen:

```ts
  async function anlegen() {
    setFehler("");
    const roh = parseFloat(neu.prozent.replace(",", "."));
    if (isNaN(roh)) { setFehler("Bitte einen gültigen Prozentwert eingeben."); return; }
    const prozent = Math.round(roh * 10) / 10;
    try {
      await api.post("/admin/steuersaetze", { prozent, bezeichnung: neu.bezeichnung });
      setNeu({ prozent: "", bezeichnung: "" });
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
```

Placeholder (Zeile 472) an die neue Möglichkeit anpassen:

```tsx
            <input className="w-full border rounded px-3 py-2 text-right" placeholder="z. B. 13 oder 4,9" value={neu.prozent}
```

- [ ] **Step 5: Frontend baut fehlerfrei (Typecheck)**

Run (in `handkassen/frontend`): `npm run build`
Expected: PASS — `tsc` meldet keine Typfehler; Vite-Build erfolgreich.

- [ ] **Step 6: Commit**

```bash
git add handkassen/frontend/src/components/BuchungsFormular.tsx handkassen/frontend/src/pages/BuchungenSeite.tsx handkassen/frontend/src/pages/AdminSeite.tsx
git commit -F- <<'EOF'
Handkassen: dezimale Steuersaetze im Frontend anzeigen und eingeben

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 4: Manuelle Start-Belegnummer je Kassa (Backend)

Zwei optionale Felder an `Kostenstelle` und die Vergabelogik (Untergrenze) in beiden Buchungspfaden; Admin-API übernimmt die Felder.

**Files:**
- Modify: `handkassen/backend/prisma/schema.prisma` (`Kostenstelle`, nach Zeile 87)
- Create: `handkassen/backend/prisma/migrations/<zeitstempel>_kostenstelle_start_belegnummer/migration.sql`
- Modify: `handkassen/backend/src/routes/buchungen.ts` (POST-Pfad 221-234; Korrektur-Pfad 406-418)
- Modify: `handkassen/backend/src/routes/admin.ts` (`ksSchema` 83-90; POST 92-103 automatisch via `...parse.data`; PUT 107-141)
- Test: `handkassen/backend/src/routes/buchungen.integration.test.ts`

**Interfaces:**
- Consumes: `belegnummerFormat`, `buchungEingabe`, `alsAgent`, `seedBasis`, `resetDb` (Test-Helfer, unverändert).
- Produces: `Kostenstelle.belegStartnummer: number | null`, `Kostenstelle.belegStartJahr: number | null`.

- [ ] **Step 1: Integrationstests schreiben (fehlschlagend)**

In `handkassen/backend/src/routes/buchungen.integration.test.ts` innerhalb des `run(...)`-Blocks ergänzen (nutzt vorhandene `admin`/`erfasser`-Agents und `basis`):

```ts
it("verwendet die manuelle Start-Belegnummer im Umstellungsjahr", async () => {
  await prisma.kostenstelle.update({
    where: { id: basis.ksA },
    data: { belegStartnummer: 48, belegStartJahr: 2026 },
  });
  const r = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
  expect(r.status).toBe(201);
  expect(r.body.belegLaufnummer).toBe(48);
  expect(r.body.belegnummer).toBe("2026-1000-48");
});

it("Startwert hebt nur die Untergrenze an (kein Rueckwaertsspringen)", async () => {
  await prisma.kostenstelle.update({
    where: { id: basis.ksA },
    data: { belegStartnummer: 48, belegStartJahr: 2026 },
  });
  const r1 = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
  expect(r1.body.belegLaufnummer).toBe(48);
  const r2 = await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
  expect(r2.body.belegLaufnummer).toBe(49); // Ist-Max (48) gewinnt gegen Start (48)
});

it("ignoriert die Start-Belegnummer in einem anderen Jahr", async () => {
  await prisma.kostenstelle.update({
    where: { id: basis.ksA },
    data: { belegStartnummer: 48, belegStartJahr: 2026 },
  });
  // Mai 2027 fuer ksA entsperren, damit der Erfasser dort buchen darf.
  await prisma.monatsSperre.create({
    data: { kostenstelleId: basis.ksA, jahr: 2027, monat: 5, gesperrt: false },
  });
  const r = await erfasser
    .post("/api/buchungen")
    .send(buchungEingabe(basis.ksA, basis.kontoId, { belegdatum: "2027-05-15" }));
  expect(r.status).toBe(201);
  expect(r.body.belegLaufnummer).toBe(1);
  expect(r.body.belegnummer).toBe("2027-1000-01");
});

it("speichert die Start-Belegnummer ueber die Admin-API", async () => {
  const r = await admin
    .put(`/api/admin/kostenstellen/${basis.ksA}`)
    .send({ belegStartnummer: 48, belegStartJahr: 2026 });
  expect(r.status).toBe(200);
  const ks = await prisma.kostenstelle.findUnique({ where: { id: basis.ksA } });
  expect(ks!.belegStartnummer).toBe(48);
  expect(ks!.belegStartJahr).toBe(2026);
});
```

- [ ] **Step 2: Test ausführen und Fehlschlag bestätigen**

Run (in `handkassen/backend`): `npm run test:integration -- buchungen.integration`
Expected: FAIL — `belegStartnummer`/`belegStartJahr` existieren noch nicht (Prisma/DB-Fehler bzw. Laufnummer 1 statt 48).

- [ ] **Step 3: Schema um die zwei Felder erweitern**

In `handkassen/backend/prisma/schema.prisma`, Model `Kostenstelle`, nach Zeile 87 (`saldoCent`) einfügen:

```prisma
  // Manuell setzbare Start-Belegnummer fuer die unterjaehrige Umstellung.
  // Gilt nur im belegStartJahr und hebt die laufende Nummer nur an (nie rueckwaerts).
  belegStartnummer Int?
  belegStartJahr   Int?
```

- [ ] **Step 4: Migration erzeugen**

Im Ordner `handkassen/backend` (Dev-DB muss laufen):

```bash
npx prisma migrate dev --name kostenstelle_start_belegnummer
```

Erwartung: fügt beide Spalten nullable hinzu; keine Bestandsdaten betroffen.

- [ ] **Step 5: Vergabelogik im POST-Pfad einbauen**

In `handkassen/backend/src/routes/buchungen.ts`, POST-Pfad, den Block Zeilen 221-234 ersetzen. Die Kostenstelle wird nun **vor** der Laufnummer geladen (inkl. der neuen Felder), und der Startwert hebt die Untergrenze:

```ts
    // Belegnummer läuft JE Kostenstelle UND Jahr fortlaufend (Jahr aus Belegdatum).
    const belegJahr = beleg.getFullYear();
    // Kostenstelle inkl. optionaler Start-Belegnummer laden.
    const ks = await tx.kostenstelle.findUnique({
      where: { id: eingabe.kostenstelleId },
      select: { nummer: true, belegStartnummer: true, belegStartJahr: true },
    });
    const maxLauf = await tx.buchung.aggregate({
      where: { kostenstelleId: eingabe.kostenstelleId, belegJahr },
      _max: { belegLaufnummer: true },
    });
    let basis = maxLauf._max.belegLaufnummer ?? 0;
    // Manuelle Start-Belegnummer nur im Umstellungsjahr; hebt die Untergrenze an.
    if (ks!.belegStartJahr === belegJahr && ks!.belegStartnummer != null) {
      basis = Math.max(basis, ks!.belegStartnummer - 1);
    }
    const naechsteLaufnummer = basis + 1;

    // Volle Belegnummer (z. B. "2026-1260-48").
    const belegnummer = belegnummerFormat(belegJahr, ks!.nummer, naechsteLaufnummer);
```

- [ ] **Step 6: Vergabelogik im Korrektur-Pfad einbauen**

In `handkassen/backend/src/routes/buchungen.ts`, Korrektur-Pfad, den Block Zeilen 406-418 analog ersetzen:

```ts
    // Belegnummer der Korrektur läuft je Kostenstelle und Jahr weiter (Jahr aus Belegdatum).
    const belegJahr = neuesBelegdatum.getFullYear();
    const ksK = await tx.kostenstelle.findUnique({
      where: { id: eingabe.kostenstelleId },
      select: { nummer: true, belegStartnummer: true, belegStartJahr: true },
    });
    const maxLauf = await tx.buchung.aggregate({
      where: { kostenstelleId: eingabe.kostenstelleId, belegJahr },
      _max: { belegLaufnummer: true },
    });
    let basis = maxLauf._max.belegLaufnummer ?? 0;
    if (ksK!.belegStartJahr === belegJahr && ksK!.belegStartnummer != null) {
      basis = Math.max(basis, ksK!.belegStartnummer - 1);
    }
    const naechsteLaufnummer = basis + 1;

    const belegnummer = belegnummerFormat(belegJahr, ksK!.nummer, naechsteLaufnummer);
```

- [ ] **Step 7: Admin-Schema um die Felder erweitern**

In `handkassen/backend/src/routes/admin.ts`, `ksSchema` (Zeilen 83-90):

```ts
const ksSchema = z.object({
  nummer: z.string().min(1),
  bezeichnung: z.string().min(1),
  gegenkonto: z.string().min(1),
  bereichId: z.number().int(),
  kassenartId: z.number().int(),
  anfangssaldoCent: z.number().int().optional(),
  belegStartnummer: z.number().int().positive().optional(),
  belegStartJahr: z.number().int().optional(),
});
```

Der POST-Handler (Zeilen 92-103) übernimmt die Felder bereits über `data: { ...parse.data, ... }` — **keine weitere Änderung im POST nötig.**

- [ ] **Step 8: PUT-Handler um die Felder erweitern**

In `handkassen/backend/src/routes/admin.ts`, PUT `/kostenstellen/:id` (Zeilen 107-141):

Destrukturierung (Zeile 109) erweitern:

```ts
  const { nummer, bezeichnung, gegenkonto, bereichId, kassenartId, anfangssaldoCent, belegStartnummer, belegStartJahr } = req.body ?? {};
```

Im `data`-Objekt des `prisma.kostenstelle.update` (nach `saldoCent`, Zeile 136) ergänzen — leere/entfernte Werte werden `null`, fehlende (undefined) bleiben unverändert:

```ts
      belegStartnummer:
        belegStartnummer === undefined ? alt.belegStartnummer
        : (belegStartnummer === null || belegStartnummer === "" ? null : Number(belegStartnummer)),
      belegStartJahr:
        belegStartJahr === undefined ? alt.belegStartJahr
        : (belegStartJahr === null || belegStartJahr === "" ? null : Number(belegStartJahr)),
```

- [ ] **Step 9: Integrationstests ausführen und Erfolg bestätigen**

Run (in `handkassen/backend`):

```bash
npm run test:db-vorbereiten
npm run test:integration -- buchungen.integration
```

Expected: PASS (alle vier neuen Fälle grün, bestehende Fälle unverändert grün).

- [ ] **Step 10: Alle Backend-Tests ausführen (Regression)**

Run (in `handkassen/backend`): `npm test` und `npm run test:integration`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add handkassen/backend/prisma/schema.prisma handkassen/backend/prisma/migrations handkassen/backend/src/routes/buchungen.ts handkassen/backend/src/routes/admin.ts handkassen/backend/src/routes/buchungen.integration.test.ts
git commit -F- <<'EOF'
Handkassen: manuelle Start-Belegnummer je Kassa (Umstellungsjahr) - Backend

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 5: Start-Belegnummer in der Kostenstellen-Verwaltung (Frontend)

Zwei Eingabefelder in Anlage und Zeilen-Bearbeitung plus eine Anzeigespalte.

**Files:**
- Modify: `handkassen/frontend/src/pages/AdminSeite.tsx` (`Kostenstelle`-Interface 75-87; `KostenstellenTab` 226-430)

**Interfaces:**
- Consumes: Admin-API `POST`/`PUT /admin/kostenstellen` mit `belegStartnummer`/`belegStartJahr` (Task 4).

- [ ] **Step 1: `Kostenstelle`-Interface erweitern**

In `handkassen/frontend/src/pages/AdminSeite.tsx` (Zeilen 75-87), nach `saldoCent`:

```ts
  belegStartnummer: number | null;
  belegStartJahr: number | null;
```

- [ ] **Step 2: State-Objekte um die Felder erweitern**

In `KostenstellenTab` (Zeilen 231 und 234) beide State-Objekte ergänzen (Eingaben als Text). `belegStartJahr` in `neu` mit dem aktuellen Jahr vorbelegen:

```ts
  const [neu, setNeu] = useState({ nummer: "", bezeichnung: "", gegenkonto: "", bereichId: 0, kassenartId: 0, anfangssaldo: "", belegStartnummer: "", belegStartJahr: String(new Date().getFullYear()) });
  // Inline-Bearbeitung
  const [bearbeiteId, setBearbeiteId] = useState<number | null>(null);
  const [entwurf, setEntwurf] = useState({ nummer: "", bezeichnung: "", gegenkonto: "", bereichId: 0, kassenartId: 0, anfangssaldo: "", belegStartnummer: "", belegStartJahr: "" });
```

- [ ] **Step 3: `anlegen` sendet die Felder**

In `anlegen` (Zeilen 252-260), den `api.post`-Body erweitern und den `setNeu`-Reset (Zeile 261) anpassen:

```ts
      await api.post("/admin/kostenstellen", {
        nummer: neu.nummer.trim(),
        bezeichnung: neu.bezeichnung,
        gegenkonto: neu.gegenkonto.trim(),
        bereichId: neu.bereichId,
        kassenartId: neu.kassenartId,
        anfangssaldoCent: neu.anfangssaldo ? euroStringZuCent(neu.anfangssaldo) : 0,
        ...(neu.belegStartnummer.trim()
          ? { belegStartnummer: Number(neu.belegStartnummer), belegStartJahr: Number(neu.belegStartJahr) }
          : {}),
      });
      setNeu({ nummer: "", bezeichnung: "", gegenkonto: "", bereichId: 0, kassenartId: 0, anfangssaldo: "", belegStartnummer: "", belegStartJahr: String(new Date().getFullYear()) });
```

- [ ] **Step 4: `bearbeitenStarten` befüllt die Felder**

In `bearbeitenStarten` (Zeilen 271-282), den `setEntwurf`-Aufruf erweitern:

```ts
    setEntwurf({
      nummer: k.nummer,
      bezeichnung: k.bezeichnung,
      gegenkonto: k.gegenkonto ?? "",
      bereichId: k.bereichId,
      kassenartId: k.kassenartId,
      anfangssaldo: (k.anfangssaldoCent / 100).toFixed(2).replace(".", ","),
      belegStartnummer: k.belegStartnummer != null ? String(k.belegStartnummer) : "",
      belegStartJahr: k.belegStartJahr != null ? String(k.belegStartJahr) : String(new Date().getFullYear()),
    });
```

- [ ] **Step 5: `bearbeitenSpeichern` sendet die Felder**

In `bearbeitenSpeichern` (Zeilen 289-296), den `api.put`-Body erweitern. Leere Startnummer sendet `null` (löscht den Wert):

```ts
      await api.put(`/admin/kostenstellen/${id}`, {
        nummer: entwurf.nummer.trim(),
        bezeichnung: entwurf.bezeichnung,
        gegenkonto: entwurf.gegenkonto.trim(),
        bereichId: entwurf.bereichId,
        kassenartId: entwurf.kassenartId,
        anfangssaldoCent: cent,
        belegStartnummer: entwurf.belegStartnummer.trim() ? Number(entwurf.belegStartnummer) : null,
        belegStartJahr: entwurf.belegStartnummer.trim() ? Number(entwurf.belegStartJahr) : null,
      });
```

- [ ] **Step 6: Eingabefelder im Anlage-Formular ergänzen**

In `handkassen/frontend/src/pages/AdminSeite.tsx`, im „Neue Kostenstelle anlegen"-`Karte` nach dem Grid (nach Zeile 346, vor dem Bereich/Art-Hinweis Zeile 347) einen kompakten Zusatzblock einfügen:

```tsx
        <div className="grid grid-cols-8 gap-3 items-end mt-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Start-Belegnummer (optional)</label>
            <input className="w-full border rounded px-3 py-2 text-right" placeholder="z. B. 48" value={neu.belegStartnummer}
              onChange={(e) => setNeu({ ...neu, belegStartnummer: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">gilt für Jahr</label>
            <input className="w-full border rounded px-3 py-2 text-right" value={neu.belegStartJahr}
              onChange={(e) => setNeu({ ...neu, belegStartJahr: e.target.value })} />
          </div>
          <p className="col-span-5 text-xs text-slate-500 self-center">
            Für die unterjährige Umstellung: die erste Buchung dieser Kassa im angegebenen Jahr erhält diese laufende Nummer.
          </p>
        </div>
```

- [ ] **Step 7: Anzeigespalte in der Tabelle ergänzen**

Tabellenkopf (Zeilen 358-361): eine Spalte „Start-Beleg" vor der Status-Spalte einfügen:

```tsx
              <th className="py-2">Nummer</th><th>Bezeichnung</th><th>Gegenkonto</th><th>Bereich</th><th>Art</th>
              <th className="text-right">Anfangssaldo</th><th className="text-right">akt. Saldo</th><th>Start-Beleg</th><th>Status</th><th></th>
```

In der Datenzeile nach der „akt. Saldo"-Zelle (nach Zeile 408) eine Zelle einfügen, die im Edit-Modus zwei kleine Felder zeigt, sonst „Nr (Jahr)" oder „–":

```tsx
                <td>
                  {imEdit ? (
                    <div className="flex gap-1">
                      <input className={`${zelleInput} w-16 text-right`} placeholder="Nr." value={entwurf.belegStartnummer}
                        onChange={(e) => setEntwurf({ ...entwurf, belegStartnummer: e.target.value })} />
                      <input className={`${zelleInput} w-16 text-right`} placeholder="Jahr" value={entwurf.belegStartJahr}
                        onChange={(e) => setEntwurf({ ...entwurf, belegStartJahr: e.target.value })} />
                    </div>
                  ) : (k.belegStartnummer != null ? `${k.belegStartnummer} (${k.belegStartJahr})` : <span className="text-slate-400">–</span>)}
                </td>
```

- [ ] **Step 8: Frontend baut fehlerfrei (Typecheck)**

Run (in `handkassen/frontend`): `npm run build`
Expected: PASS — keine Typfehler, Vite-Build erfolgreich.

- [ ] **Step 9: Commit**

```bash
git add handkassen/frontend/src/pages/AdminSeite.tsx
git commit -F- <<'EOF'
Handkassen: Start-Belegnummer je Kassa in der Kostenstellen-Verwaltung

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Hinweise für die Ausführung

- **Reihenfolge:** Task 1 → 2 → 3 (Feature Steuersätze), dann Task 4 → 5 (Feature Start-Belegnummer). Task 3 hängt an Task 1 (Helper) und Task 2 (Zahlen-Vertrag). Task 5 hängt an Task 4 (API-Felder).
- **Migrationen:** Beide Schemaänderungen (Task 2, Task 4) erzeugen je eine Migration. Nach dem Zusammenführen wendet der Server sie beim Start automatisch an (`migrate deploy`); Bestandsdaten (echte Buchungen) bleiben erhalten.
- **Kein Produktions-Deploy** (`docker compose --profile produktion …`) ohne ausdrückliche Freigabe des Nutzers.
- Nach allen Tasks: `node scripts/drift-check.mjs` (falls vorhanden) im Repo-Root ausführen — die geänderten Dateien (`geld.ts`, `AdminSeite.tsx`, Routen) zählen nicht zu den drift-geschützten geteilten Dateien, der Check sollte grün bleiben.
