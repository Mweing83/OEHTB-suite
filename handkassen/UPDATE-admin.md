# Update einspielen: Admin-Oberfläche

Diese Version bringt eine Verwaltungs-Oberfläche für Administratoren und ein
paar Schema-Änderungen mit. Du musst die geänderten Dateien übernehmen und die
Datenbank einmalig aktualisieren.

## Was neu ist

- Menüpunkt "Verwaltung" (nur für Rolle admin sichtbar) mit Tabs:
  Benutzer, Kostenstellen, Steuersätze, Kontenplan, Audit-Log.
- Benutzer anlegen ohne Passwort: der Nutzer vergibt es beim ersten Login selbst.
- Passwort-Reset durch Admin (Nutzer muss danach neu setzen).
- Kostenstellen-Zuweisung pro Benutzer (welche Kasse darf wer bearbeiten).
- Anfangssaldo je Kostenstelle.
- Steuersätze sind jetzt frei anpassbar (Tabelle statt festverdrahtet).
- Alles ist deaktivierbar statt löschbar (revisionssicher).

## Schritte (im Ordner "backend", PowerShell)

1. Geänderte Dateien übernehmen (aus dem neuen ZIP in den Projektordner kopieren
   und vorhandene überschreiben). Deine ARM64-Einstellungen in schema.prisma und
   backend\.env bleiben dabei erhalten – sie werden nicht überschrieben, solange
   du nur die hier genannten Dateien kopierst.

2. Datenbank-Struktur aktualisieren:
   ```
   npx prisma generate
   npx prisma migrate dev --name admin-oberflaeche
   ```

3. Standard-Steuersätze (0/10/20) einspielen (nur falls noch nicht vorhanden):
   ```
   npm run seed
   ```
   Der Seed ist "idempotent" – vorhandene Daten werden nicht doppelt angelegt.

4. Starten wie gewohnt (oder per "Handkassen starten.bat"):
   ```
   npm run dev
   ```

## Hinweis zu bestehenden Benutzern

Falls du vorher schon eigene Benutzer angelegt hattest: Die neue Spalte
"passwortSetzen" steht bei bestehenden Datensätzen standardmäßig auf "true".
Das bedeutet, sie müssten beim nächsten Login ein Passwort neu setzen. Die
Demo-Benutzer (admin/leitung/erfasser) werden vom Seed auf "kein Reset nötig"
gesetzt, damit du dich weiterhin direkt mit admin / admin123 anmelden kannst.

---

# Nachtrag: Stammdaten direkt bearbeiten

Erweiterung der Verwaltungs-Oberfläche. Stammdaten lassen sich jetzt nicht nur
anlegen und deaktivieren, sondern auch direkt in der Tabelle bearbeiten.

## Was neu ist

- In den Tabs **Benutzer**, **Kostenstellen** und **Kontenplan** gibt es pro
  Zeile einen Link "bearbeiten". Damit wird die Zeile direkt zum Eingabefeld;
  mit "speichern" / "abbrechen" wird die Änderung übernommen bzw. verworfen.
- Editierbare Felder:
  - **Kostenstellen:** Bezeichnung, Bereich, Art (Einrichtung/Klientenkasse),
    Anfangssaldo. Ersetzt den bisherigen Anfangssaldo-Dialog.
  - **Kontenplan:** Bezeichnung, Beschreibung, Anmerkung. (Die Kontonummer
    bleibt unveränderlich, da sie als Identifikator dient.)
  - **Benutzer:** Name und Rolle. (Der Benutzername bleibt unveränderlich.)
- Im Formular "Neue Kostenstelle anlegen" gibt es jetzt zusätzlich ein Feld
  **Art** (Einrichtung/Klientenkasse); zuvor war hier immer "Einrichtung" fest
  vorgegeben.
- **Steuersätze** bleiben bewusst unverändert: weiterhin nur anlegen und
  aktiv/inaktiv schalten. Grund: Der Prozentwert wird in den Buchungspositionen
  als Zahl mitgespeichert; ein nachträgliches Ändern würde Altbuchungen nicht
  rückwirkend korrigieren und wäre missverständlich. Stattdessen: alten Satz
  deaktivieren und einen neuen anlegen.

## Hinweis zum Anfangssaldo

Wird der Anfangssaldo einer Kostenstelle geändert, verschiebt sich der laufende
Saldo automatisch um dieselbe Differenz (der Startbestand wird verschoben, die
gebuchten Bewegungen bleiben unangetastet). Dieses Verhalten ist unverändert –
neu ist nur, dass die Änderung jetzt im normalen Bearbeiten-Modus statt über
einen separaten Dialog erfolgt.

## Schritte

Dieses Update betrifft **nur das Frontend** – keine Schema-Änderung, keine
Migration, kein Seed nötig. Die benötigten Backend-Endpunkte (PUT auf
Kostenstellen, Konten und Benutzer) waren bereits vorhanden.

1. Geänderte Datei übernehmen:
   ```
   frontend\src\pages\AdminSeite.tsx
   ```

2. Falls der Dev-Server läuft, übernimmt Vite die Änderung automatisch
   (Hot Reload). Andernfalls wie gewohnt starten:
   ```
   npm run dev
   ```

Alle Änderungen werden wie bisher im Audit-Log protokolliert
(`kostenstelle.bearbeitet`, `konto.bearbeitet`, `benutzer.bearbeitet`).

---

# Nachtrag 2: Bereiche und Arten pflegbar machen

„Bereich“ (z. B. VBW/GVB/TBW) und „Art“ (Einrichtung/Klientenkasse) waren bisher
fest im Code verankert (Datenbank-Enums). Jetzt sind sie pflegbare Stammdaten
mit eigenen Tabs in der Verwaltung – neue Bereiche/Arten lassen sich anlegen,
umbenennen und deaktivieren.

**Dieses Update ändert das Datenbankschema und braucht daher – anders als
Nachtrag 1 – eine Migration.** Eine fertige, datenerhaltende Migration liegt
schon bei; du musst sie nur anwenden.

## Was neu ist

- Zwei neue Tabs in der Verwaltung: **Bereiche** und **Arten**. Beide
  funktionieren wie die anderen Stammdaten: anlegen, umbenennen („bearbeiten“),
  aktiv/inaktiv schalten. Gelöscht wird nichts (revisionssicher).
- Im Kostenstellen-Tab kommen die Auswahllisten für Bereich und Art jetzt aus
  diesen Tabellen statt aus fest verdrahteten Werten. Es lassen sich nur noch
  **aktive** Bereiche/Arten auswählen; deaktivierte bleiben bei bestehenden
  Kostenstellen erhalten.
- Deaktivierte Bereiche/Arten verschwinden aus der Auswahl, brechen aber keine
  bestehende Kostenstelle (deren Zuordnung bleibt bestehen).

## Geänderte Dateien

```
backend\prisma\schema.prisma
backend\prisma\seed.ts
backend\prisma\migrations\20260603100000_bereich_kassenart_stammdaten\migration.sql   (neu)
backend\src\routes\admin.ts
backend\src\routes\stammdaten.ts
frontend\src\pages\AdminSeite.tsx
frontend\src\pages\BuchungenSeite.tsx
frontend\src\pages\BerichteSeite.tsx
frontend\src\pages\AbschlussSeite.tsx
```

## Schritte (im Ordner „backend“, PowerShell)

1. Alle geänderten Dateien oben übernehmen – **inklusive** des neuen
   Migrations-Ordners `prisma\migrations\20260603100000_bereich_kassenart_stammdaten`.
   Deine ARM64-Einstellung in `schema.prisma` bleibt erhalten.

2. Vor größeren DB-Änderungen empfiehlt sich ein kurzes Backup (optional, aber
   ratsam, falls produktive Daten vorhanden sind):
   ```
   pg_dump -U <benutzer> <datenbank> > backup_vor_bereich_migration.sql
   ```

3. Prisma-Client neu generieren und die mitgelieferte Migration anwenden:
   ```
   npx prisma generate
   npx prisma migrate deploy
   ```
   Wichtig: `migrate deploy` (nicht `migrate dev`) verwenden. So wird genau die
   beigelegte SQL-Migration ausgeführt, die die vorhandenen Enum-Werte in die
   neuen Tabellen überführt und bestehende Kostenstellen darauf umhängt – ohne
   Datenverlust. (`migrate dev` würde versuchen, eine eigene Migration zu
   erzeugen, und dabei die Spalten ohne Datenübernahme neu anlegen.)

4. Standardwerte sicherstellen (idempotent – legt fehlende Bereiche/Arten an,
   ohne vorhandene zu verändern):
   ```
   npm run seed
   ```

5. Starten wie gewohnt:
   ```
   npm run dev
   ```

## Falls etwas schiefgeht

Die Migration ist so geschrieben, dass sie zuerst die neuen Tabellen füllt und
die Kostenstellen umhängt, bevor die alten Spalten entfernt werden. Bricht ein
Schritt ab, läuft die Migration in einer Transaktion zurück (Prisma führt jede
Migration transaktional aus), und die Datenbank bleibt im alten Zustand. In dem
Fall die Fehlermeldung prüfen – meist liegt es an einem Bereich/einer Art mit
einer Bezeichnung, die doppelt vorkommt.

## Hinweis zur „Art“ (Kassenart)

Die Kassenart ist im aktuellen Stand ein reines Ordnungsmerkmal – es hängt keine
automatische Buchungslogik daran. Neu angelegte Arten verhalten sich daher
genau wie die bisherigen Werte „Einrichtung“ und „Klientenkasse“.

---

# Nachtrag 3: Filter in der Benutzerliste

Die Benutzerliste im Verwaltungs-Tab hat jetzt eine Filterleiste – hilfreich,
sobald mehr Benutzer angelegt sind.

## Was neu ist

- **Suche** (Freitext) über Benutzername und Name.
- **Rolle**-Auswahl (Alle / Erfasser / Leitung / Finanzen / Admin).
- **Status**-Auswahl (Alle / aktiv / inaktiv / Passwort offen). „Passwort offen“
  zeigt gezielt die Benutzer, die ihr Passwort noch nicht gesetzt haben (also
  sich noch nie angemeldet haben).
- „Filter zurücksetzen“ und eine Trefferanzeige („X von Y Benutzern“).

Die Filter wirken rein im Browser auf der bereits geladenen Liste – im selben
Stil wie die Filterleiste auf der Buchungsseite.

## Schritte

Reines Frontend-Update – keine Schema-Änderung, keine Migration, kein Seed.

1. Geänderte Datei übernehmen:
   ```
   frontend\src\pages\AdminSeite.tsx
   ```

2. Läuft der Dev-Server, übernimmt Vite die Änderung automatisch (Hot Reload).
   Andernfalls wie gewohnt starten:
   ```
   npm run dev
   ```


