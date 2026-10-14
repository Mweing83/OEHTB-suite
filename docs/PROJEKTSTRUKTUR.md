# OEHTB-Suite – Projektstruktur erklärt

Dieses Dokument erklärt **jeden Ordner und jede Datei** der OEHTB-Suite. Es richtet
sich an Leser mit Programmier-Grundkenntnissen: Fachbegriffe werden beim ersten
Auftreten kurz erklärt.

---

## 1. Das große Bild

Die OEHTB-Suite ist eine Sammlung von **drei Fach-Tools** plus einem **Portal**,
die zusammen wie *eine* Anwendung wirken:

| Baustein | Zweck | Adresse im Browser |
|---|---|---|
| **Portal** | Anmeldung, Startseite mit Tool-Kacheln, Benutzerverwaltung | `/` |
| **Handkassen** | Kassenbuch für Handkassen (Belege, Abschlüsse, BMD-Export) | `/handkassen/` |
| **Stunden** | Auswertung von Arbeitszeit-Anfragen (mit KI-Unterstützung) | `/stunden/` |
| **Förderungen** | Förderlandschaft Österreich: Quellen, Ausschreibungen, KI-Scanner | `/foerderungen/` |

**Wie hängt das zusammen?**

```
Browser
   │
   ▼
nginx (Reverse Proxy, Port 80)  ──  verteilt Anfragen anhand des Pfads
   │
   ├── /            → Portal-Backend (Node.js, Port 3000) + Portal-Frontend
   ├── /handkassen/ → Handkassen-App (Port 3001)
   ├── /stunden/    → Stunden-App (Port 3002)
   └── /foerderungen/ → Förderungen-App (Port 3003)

Jedes Tool hat seine EIGENE PostgreSQL-Datenbank (eigener Container).
```

**Zentrale Konzepte, die überall wiederkehren:**

- **Single Sign-On (SSO):** Man meldet sich einmal im Portal an. Das Portal setzt
  ein Cookie namens `suite_token` (ein signiertes **JWT** = JSON Web Token).
  Alle Tools prüfen dieses Cookie mit demselben geheimen Schlüssel (`JWT_SECRET`)
  – deshalb muss man sich nicht pro Tool neu anmelden.
- **Benutzer-Provisionierung:** Benutzer werden zentral im Portal angelegt. Das
  Portal „provisioniert" sie dann in die Tools (per HTTP-Aufruf mit einem
  gemeinsamen Geheimnis, `PROVISION_SECRET`). So kennt jedes Tool seine Nutzer
  und deren Rollen.
- **Bewusste Duplizierung:** Dateien wie `suiteAuth.ts`, `krypto.ts`, `api.ts`
  oder `tailwind.config.js` existieren in mehreren Tools **absichtlich als
  Kopie**. Es gibt kein gemeinsames Paket – so bleibt jedes Tool eigenständig
  baubar und deploybar. Das Skript `scripts/drift-check.mjs` überwacht, dass die
  Kopien nicht auseinanderlaufen.
- **Muster-Tool:** Das `stunden`-Tool ist die Vorlage. Neue Tools (zuletzt
  `foerderungen`) übernehmen dessen Aufbau, Namensgebung und Design.
- **Alles auf Deutsch:** Variablennamen, Kommentare, Oberfläche und
  Commit-Nachrichten sind deutsch – das ist Projektkonvention.

**Technologie-Stapel (überall gleich):**

| Schicht | Technologie | Was das ist |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS | Oberfläche im Browser; Vite baut den Code, Tailwind liefert das Styling über CSS-Klassen |
| Backend | Node.js 20 + Express 4 + TypeScript | Webserver, der die API (`/api/...`) bereitstellt |
| Datenbank | PostgreSQL 16 + Prisma 5 | Prisma ist ein „ORM": man beschreibt Tabellen in `schema.prisma`, Prisma erzeugt SQL und typsicheren Zugriffscode |
| Tests | Vitest + Supertest | Vitest führt Tests aus; Supertest ruft die API im Test wie ein Browser auf |
| Betrieb | Docker + Docker Compose | Jede App läuft in einem Container; `docker-compose.yml` beschreibt das Zusammenspiel |

---

## 2. Das Wurzelverzeichnis

| Datei/Ordner | Zweck |
|---|---|
| `README.md` | Einstiegspunkt: Was ist die Suite, wie startet man sie |
| `INSTALL.md` | Installationsanleitung für den Server (inkl. Schnellinstallation per Skript) |
| `docker-compose.yml` | **Die zentrale Betriebsdatei.** Beschreibt alle Container der Suite: Portal-App, die drei Tool-Apps, deren vier Datenbanken und den nginx-Proxy. Mit dem Profil `produktion` startet `docker compose --profile produktion up -d` die komplette Suite. |
| `.env` | Echte Konfigurationswerte (Passwörter, Schlüssel). **Nie ins Git einchecken, nie weitergeben.** |
| `.env.example` | Vorlage für `.env` – zeigt, welche Variablen es gibt, mit Platzhaltern statt echter Werte |
| `.gitignore` | Sagt Git, welche Dateien nicht versioniert werden (z. B. `.env`, `node_modules`, `postgres-data`) |
| `package.json` | Wurzel-Paketdatei: gemeinsame Entwicklungswerkzeuge (ESLint, Prettier) und Sammel-Skripte |
| `package-lock.json` | Automatisch erzeugte, exakte Versionsliste aller npm-Pakete (nicht von Hand ändern) |
| `eslint.config.mjs` | Regeln für ESLint (findet Code-Fehler und Stilverstöße) |
| `.prettierrc.json` / `.prettierignore` | Konfiguration für Prettier (automatische Code-Formatierung) und Ausnahmen davon |
| `SERVER - Starten.bat` | Doppelklick-Skript für Windows: startet die ganze Suite (ruft Docker Compose auf) |
| `SERVER - Stoppen.bat` | Stoppt alle Container |
| `SERVER - Status.bat` | Zeigt an, welche Container laufen und ob sie gesund sind |
| `node_modules/` | Automatisch installierte npm-Pakete (wird von `npm install` erzeugt, nie von Hand anfassen) |

---

## 3. `nginx/` – der Verkehrspolizist

| Datei | Zweck |
|---|---|
| `nginx.conf` | Konfiguration des Reverse Proxy. Regelt: `/` geht ans Portal, `/handkassen/` an die Handkassen-App usw. Blockiert außerdem die internen Provisionierungs-Endpunkte von außen (die dürfen nur Container untereinander aufrufen). |

Ein **Reverse Proxy** ist ein vorgeschalteter Webserver: Der Browser spricht nur
mit nginx auf Port 80, nginx leitet intern an die richtige App weiter. Vorteil:
eine Adresse, ein Port, ein Cookie für alles.

---

## 4. `backend/` – das Portal-Backend (Herz der Suite)

Das ist der Server hinter dem Portal: Anmeldung, zentrale Benutzerverwaltung,
Tool-Registry (welche Tools gibt es, wer darf worauf zugreifen) und die
Provisionierung der Benutzer in die Tools.

| Datei | Zweck |
|---|---|
| `Dockerfile` | Bauanleitung für das Docker-Image (Backend bauen + Portal-Frontend als statische Dateien mitliefern) |
| `package.json` | Abhängigkeiten und Skripte (`dev`, `build`, `test`) dieses Backends |
| `tsconfig.json` | TypeScript-Compiler-Einstellungen |
| `vitest.config.ts` | Test-Konfiguration (Integrationstests laufen nur, wenn eine Test-Datenbank via `TEST_DATABASE_URL` gesetzt ist) |
| `.env` / `.env.example` | Lokale Entwicklungs-Konfiguration bzw. deren Vorlage |

### `backend/prisma/` – Datenbankschema

| Datei | Zweck |
|---|---|
| `schema.prisma` | Beschreibt die Tabellen: Benutzer, Tools, Zugriffsrechte (wer hat welche Rolle in welchem Tool), Audit-Log |
| `seed.ts` | „Saat"-Skript: legt beim Start die Tool-Registry an (Handkassen, Stunden, Förderungen mit Pfad, Rollen, Reihenfolge) und den ersten Admin. Läuft **idempotent** – mehrfaches Ausführen richtet keinen Schaden an. |
| `migrations/` | Jede Unterordner-Datei `migration.sql` ist ein versionierter Schema-Änderungsschritt. Prisma spielt sie der Reihe nach ein. `20260707..._init` = Grundschema, `20260710..._provisioning` = Provisionierungsfelder, `20260714..._audit_log_append_only` = Audit-Log darf nur wachsen, nie geändert werden. |
| `migrations/migration_lock.toml` | Merkt sich, dass PostgreSQL die Ziel-Datenbank ist (von Prisma verwaltet) |

### `backend/src/` – der Quellcode

| Datei | Zweck |
|---|---|
| `index.ts` | Startpunkt: baut den Express-Server zusammen, bindet alle Routen ein, liefert das Portal-Frontend aus, startet den Provisionierungs-Abgleich |
| `lib/auth.ts` | Passwort-Hashing und JWT-Erzeugung/-Prüfung für die Anmeldung |
| `lib/prisma.ts` | Stellt die eine, gemeinsam genutzte Prisma-Datenbankverbindung bereit |
| `lib/audit.ts` | Schreibt Einträge ins Audit-Log (wer hat wann was geändert) |
| `lib/provision.ts` | Kernlogik der Benutzer-Provisionierung: ruft die Tools auf und legt dort Benutzer an/aktualisiert sie |
| `lib/provisionWorker.ts` | Hintergrund-Abgleich: sorgt dafür, dass fehlgeschlagene Provisionierungen später erneut versucht werden |
| `middleware/auth.ts` | Express-„Middleware": prüft bei jeder API-Anfrage das Cookie und hängt den Benutzer an die Anfrage. (Middleware = Zwischenschicht, die vor der eigentlichen Route läuft.) |
| `routes/auth.ts` | API-Endpunkte für Login/Logout/Sitzungsabfrage |
| `routes/admin.ts` | API für die Verwaltung: Benutzer anlegen, Rollen zuweisen, Passwörter zurücksetzen |
| `routes/provision.ts` | Interner Endpunkt, über den der Abgleich angestoßen wird |
| `routes/provision.integration.test.ts` | Integrationstest dafür (testet gegen eine echte Test-Datenbank) |
| `src/test/setup.ts` / `src/test/helfer.ts` | Test-Infrastruktur: Datenbank vor Tests leeren, Hilfsfunktionen zum Anlegen von Testdaten |

### `backend/scripts/`

| Datei | Zweck |
|---|---|
| `import.ts` | Einmal-Import-Skript für Bestandsdaten (wird im Laufzeit-Image mitgeliefert, damit es auf dem Server ausführbar ist) |

---

## 5. `portal/` – das Portal-Frontend

Die Oberfläche, die man unter `/` sieht: Login, Kachel-Startseite, Verwaltung.
Reines Frontend – die Logik liegt in `backend/`.

| Datei | Zweck |
|---|---|
| `index.html` | Die eine HTML-Seite, in die React hineingerendert wird („Single Page Application") |
| `vite.config.ts` | Build-Konfiguration; leitet im Entwicklungsmodus `/api`-Anfragen an das Backend weiter |
| `tailwind.config.js` | **Design-Tokens der Suite**: das Marken-Navy (`marke-50` bis `marke-950`) und die Statusfarben `erfolg`/`warnung`/`gefahr`. Diese Datei ist bewusst in allen Frontends identisch. |
| `postcss.config.js` | Technisches Bindeglied, damit Tailwind beim Build läuft |
| `tsconfig.json` | TypeScript-Einstellungen |
| `tsconfig.tsbuildinfo` | Zwischenspeicher des TypeScript-Compilers (automatisch erzeugt) |
| `package.json` | Abhängigkeiten und Skripte |

### `portal/src/`

| Datei | Zweck |
|---|---|
| `main.tsx` | Einstiegspunkt: startet React |
| `App.tsx` | Legt die Seiten-Navigation fest (Login → Startseite → Verwaltung) |
| `index.css` | Bindet Tailwind ein, minimale Grundstile |
| `lib/api.ts` | Kleiner Helfer für alle API-Aufrufe (setzt Pfade, behandelt Fehler einheitlich) |
| `lib/auth.tsx` | React-„Context": hält den angemeldeten Benutzer und stellt ihn allen Seiten zur Verfügung |
| `components/Layout.tsx` | Rahmen jeder Seite: Kopfleiste mit Titel und Abmelden-Knopf |
| `components/dialog.tsx` | Wiederverwendbarer Bestätigungs-/Hinweis-Dialog |
| `pages/LoginSeite.tsx` | Anmeldeformular |
| `pages/ToolSeite.tsx` | Die Kachel-Startseite: eine Kachel pro freigeschaltetem Tool, mit sprechenden Symbolen. Die Verwaltungs-Kachel ist dunkel (invertiert), um zu zeigen: das ist der Systembereich, kein Fach-Tool. |
| `pages/VerwaltungSeite.tsx` | Benutzerverwaltung: Konten anlegen, Rollen pro Tool vergeben |

---

## 6. `handkassen/` – Tool 1: Kassenbuch

Das älteste Tool der Suite (war zuerst eine eigenständige App – daher hat es am
meisten „eigene" Dateien wie Handbücher und Backup-Skripte).

### Dateien im Tool-Wurzelordner

| Datei | Zweck |
|---|---|
| `README.md`, `CLAUDE.md` | Beschreibung des Tools bzw. Arbeitsanweisungen für KI-gestützte Entwicklung |
| `BENUTZERHANDBUCH.md` / `.html` | Handbuch für Endanwender (Markdown-Quelle und erzeugte HTML-Fassung) |
| `Handbuch als PDF erstellen.bat` | Doppelklick-Skript, das aus dem Handbuch ein PDF erzeugt (PDF liegt nicht im Repo) |
| `BACKUP.md` | Erklärung des Backup-Konzepts |
| `docker-compose.yml` | Nur die Entwicklungs-Datenbank (`handkassen-dev-db`, Daten in `postgres-data/`). Kein App-/Backup-Dienst: Betrieb ausschließlich über das Compose im Wurzelverzeichnis |
| `backend/.env.example` | Vorlage für die lokale Backend-Konfiguration (Entwicklung) |
| `.gitattributes`, `.gitignore`, `.dockerignore` | Regeln, was Git bzw. Docker ignorieren/wie Zeilenenden behandelt werden |
| `.claude/settings.local.json` | Lokale Einstellungen für Claude Code (Entwicklungswerkzeug) |

### `handkassen/backup/` und die Backup-Ordner

| Datei/Ordner | Zweck |
|---|---|
| `backup/backup.sh` | Shell-Skript im Backup-Container: erstellt regelmäßig Datenbank-Sicherungen |
| `backup/restore.sh` / `restore-test.sh` | Wiederherstellung bzw. automatischer Test, ob ein Backup einspielbar ist |
| `backup/entrypoint.sh` | Startskript des Backup-Containers (richtet den Zeitplan ein) |
| `backups/` (`taeglich/`, `monatlich/`, `jaehrlich/`, `vor-restore/`) | Abgelegte Sicherungen nach Aufbewahrungsstufen; `vor-restore` = Sicherheitskopie unmittelbar vor einer Wiederherstellung |
| `backups-nas/`, `backups-usb/` | Zielordner für Kopien auf NAS bzw. USB-Platte |

### `handkassen/backend/`

Aufbau wie beim Portal-Backend (Dockerfile, package.json, tsconfig, vitest,
prisma). Besonderheiten:

| Datei | Zweck |
|---|---|
| `assets/logo.png` | Logo, das in PDF-Berichte eingebettet wird (`LOGO-HIER-ABLEGEN.md` erklärt, wie man es tauscht) |
| `uploads/` | Hochgeladene Belegfotos (Laufzeitdaten, nicht im Git) |
| `prisma/schema.prisma` + 17 Migrationen | Datenmodell: Kassen, Buchungen, Belege, Abschlüsse, Monatssperren, Backup-Konfiguration … Die vielen Migrationen zeigen die Entwicklungsgeschichte (z. B. `belegnummer_je_kostenstelle`, `monatssperre`, `suite_sso` = Anschluss an die Suite-Anmeldung). |
| `src/server.ts` | Startpunkt des Backends (entspricht `index.ts` der anderen Tools) |
| `src/lib/geld.ts` (+ Test) | Geldbeträge korrekt rechnen (Cent-genau, ohne Rundungsfehler) |
| `src/lib/buchungslogik.ts` (+ Test) | Fachregeln für Buchungen (Ein-/Ausgänge, Salden) |
| `src/lib/bmd-zuordnung.ts` (+ Test) | Zuordnungslogik für den Export in die Buchhaltungssoftware BMD |
| `src/lib/sperre.ts` (+ Test) | Monatssperren: abgeschlossene Monate dürfen nicht mehr geändert werden |
| `src/lib/pdf.ts` | Erzeugt PDF-Berichte (Kassenabschlüsse) |
| `src/lib/einstellungen.ts` | Lesen/Schreiben der Tool-Einstellungen |
| `src/lib/db.ts`, `audit.ts`, `auth.ts`, `suiteAuth.ts`, `provision.ts` | Datenbankzugriff, Audit-Log, lokale Anmeldung (Altbestand), Suite-SSO-Prüfung, Benutzer-Provisionierung |
| `src/middleware/auth.ts` | Zugriffsschutz für alle API-Routen |
| `src/routes/buchungen.ts`, `abschluss.ts`, `berichte.ts`, `export.ts`, `stammdaten.ts`, `admin.ts`, `auth.ts`, `provision.ts` | Die API: Buchungen erfassen, Monat abschließen, Berichte abrufen, BMD-Export, Stammdaten (Kassen, Kostenstellen), Verwaltung, Login, Provisionierung. Dateien mit `.integration.test.ts` testen die jeweilige Route gegen eine echte Datenbank. |

### `handkassen/frontend/`

Gleicher Aufbau wie das Portal-Frontend. Besonderheiten:

| Datei | Zweck |
|---|---|
| `public/scanner/opencv.js`, `jscanify.min.js` | Fremdbibliotheken für den Beleg-Scanner (Dokumentenerkennung per Kamera) |
| `src/lib/scanner.ts` | Ansteuerung dieses Scanners |
| `src/components/BelegScanner.tsx`, `BelegErfassung.tsx` | Kamera-Aufnahme und Erfassungsmaske für Belege |
| `src/components/BuchungsFormular.tsx`, `DatumFeld.tsx`, `Berichte.tsx`, `dialog.tsx` | Formular für Buchungen, Datumseingabe, Berichtsansichten, Dialoge |
| `src/pages/BuchungenSeite.tsx`, `AbschlussSeite.tsx`, `BerichteSeite.tsx`, `AdminSeite.tsx`, `KontaktSeite.tsx` | Die Hauptseiten des Tools |

---

## 7. `stunden/` – Tool 2: Arbeitszeit-Anfragen (das Muster-Tool)

Wertet per E-Mail eingehende Arbeitszeit-Anfragen mit KI-Unterstützung aus.
**Dieses Tool ist die Bauvorlage für neue Tools.**

### Tool-Wurzelordner

| Datei | Zweck |
|---|---|
| `README.md` | Beschreibung und Architektur-Überblick |
| `docker-compose.yml`, `einrichten.ps1`, `start.ps1`, `stopp.ps1` | Einzelbetrieb/Entwicklung: eigene Datenbank starten, Tool einrichten |
| `.claude/settings.local.json`, `.gitignore` | Werkzeug-Einstellungen, Ignorier-Regeln |

### `stunden/backend/src/`

| Datei | Zweck |
|---|---|
| `index.ts` | Startpunkt des Backends |
| `lib/krypto.ts` | Ver-/Entschlüsselung (AES-256-GCM) für Geheimnisse in der Datenbank – z. B. den KI-API-Schlüssel. Braucht `ENCRYPTION_KEY` mit exakt 32 Zeichen. |
| `lib/suiteAuth.ts` | Prüft das Suite-Cookie (SSO) |
| `lib/provision.ts`, `lib/audit.ts`, `lib/prisma.ts` | Provisionierung, Audit-Log, Datenbankverbindung |
| `middleware/auth.ts` | Zugriffsschutz |
| `routes/anfragen.ts`, `mitarbeiter.ts`, `admin.ts`, `sitzung.ts`, `provision.ts` | API: Anfragen bearbeiten, Mitarbeiterdaten, Einstellungen, Sitzungsinfo, Provisionierung |
| `services/imap.ts` | Holt E-Mails vom Postfach ab (IMAP-Protokoll) |
| `services/anfrage.ts`, `beschaeftigung.ts` | Fachlogik: Anfragen verarbeiten, Beschäftigungsdaten berechnen |
| `services/pseudonym.ts` | Pseudonymisiert personenbezogene Daten, bevor sie an eine KI gehen (Datenschutz) |
| `services/ollamaInstall.ts` | Hilft beim Einrichten von Ollama (lokal laufende KI) |
| `services/llm/typen.ts` | Gemeinsame Schnittstelle: „So sieht ein KI-Anbieter aus" |
| `services/llm/anthropic.ts`, `openai.ts`, `ollama.ts`, `dummy.ts` | Je eine Anbindung pro KI-Anbieter; `dummy` liefert Beispieldaten zum Testen ohne API-Schlüssel |
| `services/llm/factory.ts` | Wählt anhand der Einstellungen den richtigen Anbieter aus („Fabrik"-Muster) |

### `stunden/frontend/src/`

| Datei | Zweck |
|---|---|
| `pages/DashboardSeite.tsx` | Übersichtsseite |
| `pages/AnfragenSeite.tsx` | Liste und Bearbeitung der Anfragen |
| `pages/MitarbeiterSeite.tsx` / `MitarbeiterDetailSeite.tsx` | Mitarbeiterliste und Einzelansicht |
| `pages/AdminSeite.tsx` | Einstellungen inkl. KI-Anbieter und API-Schlüssel |
| `lib/typen.ts` | Geteilte Typdefinitionen und deutsche Beschriftungen |
| übrige Dateien | wie im Portal (Layout, api.ts, auth.tsx, dialog.tsx …) |

---

## 8. `foerderungen/` – Tool 3: Förderungs-Scanner

Das jüngste Tool: verwaltet die Förderlandschaft (Quellen + Ausschreibungen) und
durchsucht sie per KI mit Websuche. Aufbau nach `stunden`-Muster.

### `foerderungen/backend/prisma/`

| Datei | Zweck |
|---|---|
| `schema.prisma` | Datenmodell: **Foerderquelle** (wer fördert: Ebene Bund/Land/EU/…, Kategorie Projekt/Kerngeschäft), **Ausschreibung** (konkreter Aufruf mit Frist), **ScanLauf** (Protokoll jedes Scans), Benutzer, Einstellungen, Audit-Log |
| `seed.ts` | Legt 15 kuratierte Start-Förderquellen an (idempotent) |
| `migrations/…_init` / `…_scanart` | Grundschema; später kam die Trennung der Scan-Arten (Überwachung/Entdeckung) dazu |

### `foerderungen/backend/src/`

| Datei | Zweck |
|---|---|
| `index.ts` (+ `index.test.ts`) | Startpunkt; prüft beim Start u. a., ob der Verschlüsselungsschlüssel gültig ist, und startet den Zeitplan |
| `lib/konstanten.ts` | Zentrale Konstanten (Einstellungs-Schlüssel, Standard-Zeitpläne) |
| `lib/krypto.ts` | Verschlüsselung des API-Schlüssels (Kopie aus `stunden`, plus Startprüfung) |
| `lib/suiteAuth.ts`, `provision.ts`, `audit.ts`, `prisma.ts` | SSO, Provisionierung, Audit-Log, Datenbankverbindung |
| `middleware/auth.ts` | Zugriffsschutz |
| `routes/quellen.ts` | API für Förderquellen (Liste, Detail, Anlegen, Bearbeiten, Vorschläge annehmen/ablehnen) |
| `routes/ausschreibungen.ts` | API für Ausschreibungen (inkl. Prüf-Warteschlange für KI-Funde) |
| `routes/scans.ts` | Scan manuell starten (Überwachung oder Entdeckung), Verlauf abrufen |
| `routes/einstellungen.ts` | KI-Anbieter/Modell/API-Schlüssel und Scan-Zeitpläne speichern |
| `routes/sitzung.ts`, `routes/provision.ts` | Sitzungsinfo, Benutzer-Provisionierung |
| `routes/*.integration.test.ts` | Integrationstests je Routen-Datei |
| `services/scanner.ts` (+ 2 Testdateien) | **Kern des Tools:** führt einen Scan aus. Überwachung = bekannte Quellen nach neuen Ausschreibungen absuchen (in kleinen Gruppen, fehlertolerant); Entdeckung = ganz neue Förderquellen finden. Alle Funde landen als „Vorschlag" in der Prüf-Warteschlange – nichts wird ungeprüft übernommen. Doppelte Funde werden über normalisierte Links und Namensähnlichkeit erkannt. |
| `services/zeitplan.ts` | Cron-Zeitpläne (Wiener Zeit): nächtliches Fristen-Markieren, wöchentliche Überwachung, monatliche Entdeckung |
| `services/fristen.ts` (+ Test) | Markiert Ausschreibungen mit abgelaufener Frist als ABGELAUFEN |
| `services/llm/typen.ts` | Schnittstellen, das ÖHTB-Profil (Suchkontext für die KI) und ein robuster JSON-Parser für KI-Antworten |
| `services/llm/anthropic.ts` / `openai.ts` | Anbindung an Claude bzw. GPT, jeweils **mit Websuche** des Anbieters |
| `services/llm/dummy.ts` / `factory.ts` (+ Test) | Beispieldaten-Anbieter; Auswahl des Anbieters laut Einstellungen |
| `test/setup.ts`, `test/helfer.ts` | Test-Infrastruktur |

### `foerderungen/frontend/src/`

| Datei | Zweck |
|---|---|
| `pages/LandschaftSeite.tsx` | Übersicht der Förderlandschaft (Quellen mit Filtern) |
| `pages/QuelleDetailSeite.tsx` | Einzelne Quelle mit ihren Ausschreibungen |
| `pages/AusschreibungenSeite.tsx` | Alle aktiven Ausschreibungen, sortiert/gefärbt nach Frist-Dringlichkeit |
| `pages/PruefenSeite.tsx` | Prüf-Warteschlange: KI-Vorschläge annehmen oder ablehnen |
| `pages/ScansSeite.tsx` | Scan-Verlauf + Knöpfe „Überwachung starten" / „Entdeckung starten" |
| `pages/EinstellungenSeite.tsx` | KI-Anbieter, Modell-Auswahl, API-Schlüssel, Scan-Zeitpläne |
| `lib/typen.ts` | Typen, deutsche Enum-Beschriftungen, Frist-Formatierung/-Färbung |
| übrige Dateien | wie im Muster (Layout, api.ts, auth.tsx, App.tsx …) |

### Sonstiges in `foerderungen/`

| Datei/Ordner | Zweck |
|---|---|
| `docker-compose.yml` | Eigenes Compose für die Entwicklung (nur die Dev-Datenbank auf Port 5435) |
| `postgres-data/` | Rohdaten der Entwicklungs-Datenbank (von PostgreSQL selbst verwaltet, nicht im Git, nie von Hand ändern) |

---

## 9. Querschnitts-Ordner

### `docs/`

| Datei/Ordner | Zweck |
|---|---|
| `PROJEKTSTRUKTUR.md` | Dieses Dokument |
| `superpowers/specs/` | **Design-Dokumente** („Was bauen wir und warum?"), je Vorhaben eines: zentrale Benutzer-Provisionierung, Client-Installer, Förderungen-Tool |
| `superpowers/plans/` | **Umsetzungspläne** („Wie bauen wir es, Schritt für Schritt?") zu diesen Designs – mit konkreten Aufgaben und Code |

### `scripts/`

| Datei | Zweck |
|---|---|
| `drift-check.mjs` | Prüft, ob die absichtlich duplizierten Dateien (z. B. `tailwind.config.js`, `suiteAuth.ts`) in allen Tools noch identisch sind. Läuft in der CI. |

### `.github/`

| Datei | Zweck |
|---|---|
| `workflows/ci.yml` | GitHub-Actions-Pipeline: baut die Projekte, führt Linting und Tests bei jedem Push automatisch aus („CI" = Continuous Integration) |

### `.superpowers/` (nicht im Git)

Arbeitsnotizen der KI-gestützten Entwicklung (Aufgaben-Protokolle,
Review-Pakete, Fortschritts-Ledger). Reine Entwicklungsartefakte – für den
Betrieb bedeutungslos.

---

## 10. Automatisch erzeugte Ordner (nie von Hand anfassen)

| Ordner | Erzeugt von | Inhalt |
|---|---|---|
| `node_modules/` (überall) | `npm install` | Installierte Bibliotheken |
| `dist/` (in Frontends/Backends) | `npm run build` | Gebauter, auslieferbarer Code |
| `*/postgres-data/` | PostgreSQL | Rohdaten der Entwicklungs-Datenbanken |
| `tsconfig.tsbuildinfo` | TypeScript | Compiler-Zwischenspeicher |
| `handkassen/backend/uploads/` | die App | Hochgeladene Belegfotos |
| `handkassen/backups*/` | Backup-Container | Datenbank-Sicherungen |

---

## 11. Wie alles zusammen läuft – ein Rundgang

1. **Start:** `SERVER - Starten.bat` → `docker compose --profile produktion up -d`
   baut/startet: 4 Datenbanken, 4 Apps, 1 nginx.
2. **Anmeldung:** Browser → `http://server/` → nginx → Portal. Login prüft
   Passwort, setzt das `suite_token`-Cookie.
3. **Tool öffnen:** Klick auf eine Kachel → z. B. `/foerderungen/` → nginx leitet
   an die Förderungen-App. Deren `suiteAuth.ts` prüft das Cookie – fertig, kein
   zweiter Login.
4. **Benutzer anlegen:** In der Verwaltung anlegen + Rollen wählen → das Portal
   ruft die Provisionierungs-Endpunkte der Tools auf → der Benutzer existiert
   überall, wo er freigeschaltet ist.
5. **Scan:** Zeitplan (oder Knopf) startet `scanner.ts` → KI durchsucht das Web →
   Funde landen als Vorschläge in der Prüf-Warteschlange → ein Mensch entscheidet.
