# Handkassen: Kontenpläne je Bereich freigeben — Design

**Datum:** 2026-07-27
**Tool:** Handkassen (`handkassen/`)
**Status:** abgestimmt, zur Umsetzung freigegeben

## Ziel

Konten sollen nach Bereichen (VBW, GVB, TBW, …) strukturiert werden: Jeder
Bereich sieht und verwendet nur die für ihn **freigegebenen** Konten. Der
Zugriff auf Konten anderer Bereiche ist ausgeschlossen — sowohl in der
Buchungsmaske als auch serverseitig durchgesetzt. Ein Konto kann für **mehrere**
Bereiche freigegeben sein.

## Ausgangslage (Ist-Zustand)

- `Konto` ist ein **globaler Katalog** (`nummer` global eindeutig; Felder
  `bezeichnung`, `beschreibung?`, `anmerkung?`, `aktiv`). Kein Bezug zu Bereichen.
- `Bereich` ist Stammdatum (VBW/GVB/TBW …); jede `Kostenstelle` gehört zu genau
  einem Bereich (`kostenstelle.bereichId`).
- Buchungsmaske (`BuchungsFormular`) kennt die `kostenstelleId` bereits als Prop,
  lädt aber die Konten über `GET /konten` **ungefiltert** (alle aktiven Konten).
- Buchungslogik: `POST /api/buchungen` und `POST /api/buchungen/:id/korrigieren`
  prüfen `darfKostenstelle` und rufen `buchungValidieren` (nur Struktur/Beträge/
  Steuersätze; Konto wird nur als gültige Integer-ID geprüft, kein Bereichsbezug).
- BMD-Export und Steuercode-Logik (`bmd-zuordnung.ts`) knüpfen an
  **Kontonummern** an (String), nicht an interne IDs. Sonderkonten wie `99900`,
  `76900` sind Konventionen, im Code nicht fest verdrahtet.
- Bestehende Buchungen referenzieren Konten per `kontoId` (FK) — historische
  Daten sind von einer Freigabe-Änderung nicht betroffen.

## Getroffene Entscheidungen

1. **Modell:** gemeinsamer Konten-Katalog + n:m-**Freigabe** Konto ↔ Bereich.
   Ein Konto kann für einen, mehrere oder alle Bereiche freigegeben sein.
   Kontonummer bleibt **global eindeutig** (keine Duplikate).
2. **Durchsetzung:** serverseitig beim Speichern/Korrigieren einer Buchung, nicht
   nur per UI-Filter.
3. **Migration:** alle bestehenden Konten werden übernommen und **für alle
   Bereiche freigegeben** (nichts bricht, sofort weiter buchbar). Ausmisten je
   Bereich erfolgt danach durch den Admin.

## Datenmodell

Neue Verknüpfungstabelle (n:m), additiv — `Konto` und `Buchung` bleiben unverändert:

```prisma
model BereichKonto {
  bereichId Int
  kontoId   Int
  bereich   Bereich @relation(fields: [bereichId], references: [id])
  konto     Konto   @relation(fields: [kontoId], references: [id])

  @@id([bereichId, kontoId])
  @@map("bereich_konto")
}
```

- `Bereich` erhält `konten BereichKonto[]`, `Konto` erhält `bereiche BereichKonto[]`.
- Löschregel: Eine Freigabe ist reine Zuordnung; das Entfernen einer Freigabe
  löscht **keine** Buchungen (die hängen an `kontoId`). Kein Cascade auf Buchungen.

## API-Änderungen

**Buchungsmaske — gefilterte Kontenliste**
- `GET /api/konten?kostenstelle=<id>` (stammdaten-Router):
  - Verlangt `kostenstelle`; prüft `darfKostenstelle` (wie bei `GET /buchungen`).
  - Ermittelt den Bereich der Kostenstelle und liefert nur **aktive** Konten, die
    diesem Bereich freigegeben sind (`bereich_konto`), sortiert nach `nummer`.
  - Ohne `kostenstelle`-Parameter: 400 (die Maske ruft immer mit Kostenstelle auf).

**Admin — Konten inkl. Freigaben verwalten**
- `GET /api/admin/konten`: liefert je Konto zusätzlich die Liste der freigegebenen
  `bereichId`s (bzw. Bereiche), für die Anzeige der Freigaben.
- `POST /api/admin/konten`: Schema um `bereichIds: number[]` erweitert (optional,
  Default leer). Legt Konto an und setzt die Freigaben in einer Transaktion.
- `PUT /api/admin/konten/:id`: akzeptiert `bereichIds: number[]` und setzt die
  Freigaben **als Gesamtmenge** neu (fehlende werden entfernt, neue hinzugefügt),
  neben `bezeichnung`/`beschreibung`/`anmerkung`. Audit-Log erfasst die Änderung.
- `POST /api/admin/konten/:id/aktiv`: unverändert (deaktiviertes Konto erscheint
  in keiner Buchungsmaske, unabhängig von Freigaben).

## Serverseitige Durchsetzung (Kern)

In `POST /api/buchungen` und `POST /api/buchungen/:id/korrigieren`, nach der
`darfKostenstelle`-Prüfung und vor dem Schreiben:

- Bereich der Ziel-Kostenstelle ermitteln.
- Für **jede** Position prüfen: Konto existiert, ist `aktiv` und ist dem Bereich
  der Kostenstelle in `bereich_konto` freigegeben.
- Andernfalls Abbruch mit `400` und klarer Meldung (z. B. „Konto <nummer> ist für
  diesen Bereich nicht freigegeben."), keine Buchung wird geschrieben.

Damit ist der Fremdzugriff unabhängig von der UI ausgeschlossen (auch bei
manipulierten Requests).

## Verwaltung (Frontend, AdminSeite)

- Konto-Formular (Anlegen/Bearbeiten): **Bereichs-Mehrfachauswahl** (Checkboxen
  aller aktiven Bereiche). Auswahl = Freigabe.
- Konto-Liste: je Konto die freigegebenen Bereiche als Kennzeichnung (Badges);
  Filter nach Bereich. Konten ohne Freigabe sind sichtbar erkennbar.
- Bereiche werden über den bestehenden `GET /api/bereiche` geladen.

## BMD-Export & Sonderkonten

Keine Änderung. Export und Steuercode-Liste arbeiten mit Kontonummern.
Ein gemeinsames Konto (z. B. `99900`, `76900`) wird **einmal** angelegt und
mehreren Bereichen freigegeben — keine Duplikate nötig.

## Migration & Rollout

- Prisma-Migration legt `bereich_konto` an (additiv).
- **Datenmigration (Teil derselben Migration):** für jede bestehende Kombination
  aus vorhandenem `Bereich` und vorhandenem `Konto` einen `bereich_konto`-Eintrag
  anlegen (alle Konten für alle Bereiche freigegeben). Damit bleibt der Betrieb
  ohne Unterbrechung buchbar; das Ausmisten je Bereich erfolgt danach im Admin.
- Historische Buchungen bleiben unberührt.

## Seed (Demo)

- Der Handkassen-Seed gibt die Beispielkonten den Beispielbereichen frei — dabei
  mindestens ein Konto für **mehrere** Bereiche, damit der n:m-Fall abgedeckt ist.

## Tests

Integrationstests (gegen echte DB, Muster wie bestehende Handkassen-Tests):
- `GET /konten?kostenstelle` liefert nur die dem Bereich freigegebenen aktiven
  Konten; deaktivierte und nicht freigegebene fehlen.
- Buchung mit Konto **ohne** Freigabe für den Bereich der Kostenstelle → 400,
  keine Buchung angelegt. Analog für `/korrigieren`.
- Buchung mit freigegebenem Konto → erfolgreich.
- Ein für mehrere Bereiche freigegebenes Konto erscheint in beiden Bereichen.
- Admin `POST`/`PUT /admin/konten` setzt/ändert Freigaben; Kontonummer bleibt
  global eindeutig (Duplikat → 409).

## Nicht im Scope (YAGNI)

- Keine Duplizierung von Kontonummern je Bereich (bewusst ein globaler Katalog).
- Keine automatische Zuordnung von Sonderkonten (`99900`/`76900`) — der Admin gibt
  sie den Bereichen frei.
- Keine Rückwirkung auf historische Buchungen; Berichtsfilter bleiben datengetrieben.
