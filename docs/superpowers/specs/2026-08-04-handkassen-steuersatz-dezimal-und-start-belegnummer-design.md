# Handkassen: Dezimale Steuersätze & manuelle Start-Belegnummer — Design

**Datum:** 2026-08-04
**Modul:** Handkassen (Portal-Tool der OEHTB-Suite)

## Ziel

Zwei unabhängige, rückwärtskompatible Änderungen am Handkassen-Modul:

1. **Steuersätze mit optionaler Nachkommastelle.** Steuersätze sollen gebrochene
   Werte (z. B. 4,9 %) speichern und anzeigen können. Nachkommastellen werden nur
   angezeigt, wenn sie ungleich 0 sind: 10 %, 13 %, 20 % ohne Nachkommastelle,
   4,9 % mit einer.
2. **Manuell setzbare Start-Belegnummer je Kassa.** Bei unterjähriger Umstellung
   einer Kassa soll die erste laufende Belegnummer manuell gesetzt werden können,
   damit die Nummerierung des Jahres lückenlos fortgeführt wird.

Beide Änderungen sind so entworfen, dass bestehende Steuersätze und bereits
gebuchte Positionen gültig bleiben.

---

## Änderung 1 — Steuersätze mit optionaler Nachkommastelle

### Ausgangslage

- `Steuersatz.prozent` ist `Int @unique` (schema.prisma).
- `BuchungsPosition.steuersatz` ist `Int` — der Rohwert des Satzes wird pro Position
  gespeichert (keine Fremdschlüssel-Beziehung zu `Steuersatz`).
- Anzeige erfolgt an drei Stellen hart als `{x} %` / `${x}%`:
  - Buchungsformular-Dropdown: `frontend/src/components/BuchungsFormular.tsx`
  - Admin-Steuersatz-Tabelle: `frontend/src/pages/AdminSeite.tsx`
  - Buchungsliste: `frontend/src/pages/BuchungenSeite.tsx`
- Es gibt **keinen** gemeinsamen Prozent-Formatierungs-Helper.
- Werte fließen im Frontend durchgängig als `number`.

### Datenmodell (Migration nötig)

- `Steuersatz.prozent`: `Int` → `Decimal @db.Decimal(5,1)` (bleibt `@unique`).
- `BuchungsPosition.steuersatz`: `Int` → `Decimal @db.Decimal(5,1)`.

Precision **1 Nachkommastelle** (Decimal(5,1)) laut Entscheidung. Migration castet
bestehende Ganzzahlen verlustfrei (`20` → `20.0`) via
`ALTER TABLE ... ALTER COLUMN ... TYPE numeric(5,1)`.

### Anzeige-Helper

Neue Funktion in `frontend/src/lib/geld.ts`:

```ts
// Formatiert einen Prozentsatz für die Anzeige. Ganze Werte ohne
// Nachkommastelle, gebrochene Werte mit de-AT-Komma und einer Nachkommastelle.
// 20 -> "20", 13 -> "13", 4.9 -> "4,9", 0 -> "0"
export function formatProzent(satz: number): string {
  return Number.isInteger(satz)
    ? String(satz)
    : satz.toLocaleString("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
```

Aufrufstellen zeigen `{formatProzent(x)} %` (das literale `%` bleibt an der
Aufrufstelle, damit Abstände/Layout unverändert bleiben):

- `BuchungsFormular.tsx`: Dropdown-Label `{formatProzent(s.prozent)} %` (der
  `<option value>` bleibt der numerische Rohwert).
- `AdminSeite.tsx`: Tabellenzelle `{formatProzent(s.prozent)} %`.
- `BuchungenSeite.tsx`: `${p.konto.nummer} (${formatProzent(p.steuersatz)}%)`.

### Eingabe & Serialisierung

- **Admin-Anlage „Neuen Steuersatz":** Parsing von `parseInt` auf ein
  Dezimal-Parsing umstellen, das sowohl „4,9" als auch „4.9" akzeptiert und auf
  eine Nachkommastelle rundet. Ungültige Eingaben werden wie bisher abgelehnt.
- **Backend-Serialisierung:** Prisma liefert `Decimal`-Felder als `Decimal`-Objekte;
  `JSON.stringify` würde sie als **String** ausgeben und damit die numerischen
  Vergleiche und `value`-Bindungen im Frontend brechen. Deshalb wandeln die
  Endpunkte, die Steuersätze bzw. Buchungspositionen ausliefern, `Decimal` vor dem
  Senden in `number` um (`.toNumber()`). Betroffen sind mindestens:
  - `GET /steuersaetze` (operative Liste)
  - `GET`/`POST` `/admin/steuersaetze` (Admin-Verwaltung)
  - Buchungslisten-Endpunkte, die `positionen[].steuersatz` mitliefern.
  Das Frontend behält damit `prozent: number` / `steuersatz: number`.
- **MwSt-Berechnung:** Die enthaltene Steuer wird weiterhin aus dem Bruttobetrag und
  dem Satz berechnet (`enthalteneSteuerCent(bruttoCent, satz)` bzw. die
  Backend-Berichtslogik) und auf den Cent gerundet. Mit dezimalem Satz (z. B. 4,9)
  bleibt die Formel identisch; nur der Typ des Satzes ändert sich von ganzzahlig auf
  dezimal. Rundung auf den Cent wie bisher.

### Kompatibilität

Bestehende Sätze und Positionen (ganzzahlig) werden zu `x.0` migriert und von
`formatProzent` wieder ohne Nachkommastelle angezeigt — optisch keine Änderung für
bestehende Sätze.

---

## Änderung 2 — Manuell setzbare Start-Belegnummer je Kassa

### Ausgangslage

- Belegnummern laufen **je Kostenstelle und je Jahr** (`belegLaufnummer`), berechnet
  als `max(belegLaufnummer) + 1` innerhalb `prisma.$transaction`; Eindeutigkeit über
  `@@unique([kostenstelleId, belegJahr, belegLaufnummer])`.
- Der Jahresbezug (`belegJahr`) stammt aus dem **Belegdatum**.
- Es gibt keinen gespeicherten Zähler. Reset auf 1 zum Jahreswechsel ist implizit
  (jahresgefilterte `max`-Abfrage).
- Volle Belegnummer via `belegnummerFormat(jahr, ksNummer, lauf)` →
  `"2026-1370-48"` (Laufnummer min. 2-stellig, null-gepadded).
- Dieselbe `max+1`-Logik existiert im Neu-Buchungs- und im Korrektur-Pfad
  (`routes/buchungen.ts`).

### Datenmodell

Zwei neue optionale Felder an `Kostenstelle` (schema.prisma):

- `belegStartnummer Int?` — gewünschte erste laufende Nummer.
- `belegStartJahr Int?` — Jahr, für das die Startnummer gilt (Umstellungsjahr).

Migration fügt beide Spalten nullable hinzu; keine Bestandsdaten betroffen.

### Vergabelogik

In beiden Pfaden (`buchungen.ts` Neu-Buchung **und** Korrektur), wo bereits
`kostenstelle` geladen wird (dort zusätzlich `belegStartnummer`, `belegStartJahr`
selektieren):

```ts
let basis = maxLauf._max.belegLaufnummer ?? 0;
if (ks.belegStartJahr === belegJahr && ks.belegStartnummer != null) {
  basis = Math.max(basis, ks.belegStartnummer - 1);
}
const naechsteLaufnummer = basis + 1;
```

Eigenschaften:

- Der Startwert **hebt nur die Untergrenze an** — er kann nie zu Doppelnummern
  führen (die `@@unique`-Constraint bleibt zusätzliche Absicherung).
- Gilt nur, wenn `belegStartJahr` dem `belegJahr` der Buchung entspricht → im
  Folgejahr greift der Startwert nicht mehr, Nummerierung beginnt wieder bei 1.
- Ist der Ist-Bestand bereits höher als die Startnummer, bleibt der Startwert
  wirkungslos (kein Rückwärtsspringen).

### Admin-Oberfläche

In `frontend/src/pages/AdminSeite.tsx`, Komponente `KostenstellenTab`:

- Zwei zusätzliche Felder im Anlage-Formular und im Zeilen-Bearbeiten-Formular:
  - „Start-Belegnummer" (numerisch, optional)
  - „gilt für Jahr" (numerisch, mit aktuellem Jahr vorbelegt)
- Die beiden State-Objekte (`neu`, `entwurf`) werden um `belegStartnummer` und
  `belegStartJahr` erweitert.
- Anzeige des aktuell gesetzten Werts in der Zeile (sofern gesetzt).

### Backend-Routen

In `routes/admin.ts`:

- `ksSchema` um `belegStartnummer: z.number().int().positive().optional()` und
  `belegStartJahr: z.number().int().optional()` erweitern.
- `POST /kostenstellen` und `PUT /kostenstellen/:id` übernehmen die Felder.
- Leere Eingaben werden als „nicht gesetzt" (`null`) gespeichert.

---

## Tests

### Änderung 1
- **Unit** `formatProzent`: `20 → "20"`, `13 → "13"`, `10 → "10"`, `0 → "0"`,
  `4.9 → "4,9"`.
- **Backend** MwSt-Berechnung mit dezimalem Satz (z. B. 4,9 %): korrekt auf den Cent
  gerundet.
- **Migrations-Smoke:** bestehende ganzzahlige Sätze/Positionen bleiben nach der
  Migration lesbar und werden ohne Nachkommastelle angezeigt.
- **Admin-Anlage:** „4,9" und „4.9" ergeben beide den Satz 4,9; ungültige Eingaben
  abgelehnt.

### Änderung 2
- **Integration:** `belegStartnummer=48`, `belegStartJahr=2026` gesetzt → erste
  Buchung erhält `belegLaufnummer=48`, `belegnummer="2026-<ksNummer>-48"`.
- **Integration:** Buchung mit Belegdatum 2027 ignoriert den Startwert →
  `belegLaufnummer=1`.
- **Integration:** existiert bereits eine Buchung mit `belegLaufnummer=60`, bleibt
  ein gesetzter Startwert 48 wirkungslos → nächste Nummer 61.
- **Admin:** POST/PUT persistieren die beiden Felder; leere Eingabe → `null`.

## Globale Rahmenbedingungen

- Alles deutschsprachig (Bezeichner, Kommentare, UI). Commits mit ASCII-Umlauten
  (ae/oe/ue).
- Handkassen-Backend ist ESM: relative Imports mit `.js`-Endung.
- Geld in Cent. Prisma-Migrationen werden beim Container-Start automatisch angewandt.
- Keine Abschwächung bestehender Security-Boot-Guards.
