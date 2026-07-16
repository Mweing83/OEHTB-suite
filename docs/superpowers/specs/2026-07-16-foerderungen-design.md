# OEHTB-Suite – Werkzeug „Förderungen" (Förder-Scanner)

Datum: 2026-07-16
Status: Genehmigt (Design)

## Ziel

Ein neues Suite-Werkzeug **„Förderungen"**, das die für die ÖHTB relevante
österreichische Förderlandschaft abbildet – sowohl **projektbezogene
Förderungen** als auch Förderungen für das **Kerngeschäft** (Behindertenhilfe,
Wohnen, Werkstätten). Kern des Werkzeugs sind **aktuell offene Ausschreibungen
mit Fristen**, damit keine Einreichfrist übersehen wird. Ein **KI-gestützter
Scanner** hält die Daten aktuell: Er überwacht bekannte Fördergeber und
entdeckt neue Förderquellen; alle Funde landen als Vorschläge in einer
Prüf-Ansicht und werden erst nach menschlicher Freigabe sichtbar (Hybrid:
kuratiert + Scan).

Abgedeckter Umfang der Förderlandschaft:

- Öffentliche Hand, alle Ebenen: Bund (Sozialministeriumservice, FFG, aws, …),
  Länder (insb. FSW Wien), Gemeinden
- EU-Ebene: ESF+, Erasmus+, EU4Health u. Ä.
- Privat: Stiftungen, Spendenaktionen (z. B. Licht ins Dunkel),
  Unternehmensspenden, Lotteriemittel

Nicht-Ziele (v1): Benachrichtigungen (E-Mail/Portal-Alerts), Antragsverfolgung
(Status eigener Anträge), Mehrrollen-Rechtemodell.

## Architektur-Entscheidung

**Eigenständiges Werkzeug nach dem `stunden`-Muster** (Variante A):

- Neuer Ordner `foerderungen/` mit `backend/` (Express + Prisma + eigener
  Postgres) und `frontend/` (React + Vite + Tailwind)
- Erreichbar unter `/foerderungen/`, Backend intern auf Port **3003**
- SSO-Middleware nach dem Muster von `stunden` (gemeinsames `JWT_SECRET`,
  Cookie `suite_token`, Auto-Provisioning)
- Begründung: Der Scanner hat eigenen Lebenszyklus, externe Abhängigkeit
  (LLM-API, Internet) und eigene Fehlermodi – genau dafür ist die
  Werkzeug-Isolation der Suite da. Verworfen: Portal-Integration (Portal
  bekäme LLM-/Cron-/Internet-Abhängigkeiten) und geteilte Suite-DB
  (koppelt Deployment/Backup, neues Muster).

**Rollen:** eine einzige Rolle `nutzer` – wer Zugriff auf das Werkzeug hat,
kann alles (ansehen, bearbeiten, prüfen, Scan starten, Einstellungen ändern).

## Datenmodell (Prisma, eigene DB `foerderungen`)

Trennung zwischen der *stabilen* Landschaft und den *zeitkritischen*
Ausschreibungen.

### Foerderquelle (Fördergeber/Programm – die Landschaft)

| Feld | Typ | Bemerkung |
|---|---|---|
| id | Int PK | |
| name | String | z. B. „FSW – Tagesstruktur" |
| traeger | String | z. B. „Fonds Soziales Wien" |
| ebene | Enum | `BUND \| LAND \| GEMEINDE \| EU \| PRIVAT` |
| kategorie | Enum | `PROJEKT \| KERNGESCHAEFT \| BEIDES` |
| themen | String[] | Tags: Behindertenhilfe, Wohnen, Werkstätten, Digitalisierung, Bau, … |
| beschreibung | Text | |
| webseite | String? | |
| kontakt | String? | |
| status | Enum | `AKTIV \| VORGESCHLAGEN \| ARCHIVIERT` |
| quelleTyp | Enum | `MANUELL \| SCAN` (Herkunft) |
| erstellt / geaendert | DateTime | |

### Ausschreibung (konkreter Call mit Frist – zeitkritisch)

| Feld | Typ | Bemerkung |
|---|---|---|
| id | Int PK | |
| foerderquelleId | FK | → Foerderquelle |
| titel | String | |
| beschreibung | Text | |
| link | String? | normalisiert für Dedup |
| frist | DateTime? | null bei laufender Einreichung |
| laufendEinreichbar | Boolean | |
| foerderhoehe | String? | Freitext (Beträge sind selten einheitlich) |
| status | Enum | `OFFEN \| VORGESCHLAGEN \| ABGELAUFEN \| ABGELEHNT` |
| aktualisiertAusschreibungId | FK? | gesetzt bei Aktualisierungsvorschlägen (s. u.) |
| quelleTyp | Enum | `MANUELL \| SCAN` |
| erstellt / geaendert | DateTime | |

Scanner-Vorschläge sind **keine separate Warteschlangen-Tabelle**, sondern
normale Zeilen im Status `VORGESCHLAGEN`. Freigabe = Statuswechsel
(`AKTIV`/`OFFEN`), Ablehnung = `ABGELEHNT` (bleibt gespeichert, damit der
nächste Scan denselben Fund nicht erneut vorschlägt). Ein nächtlicher Job
setzt Ausschreibungen mit überschrittener Frist auf `ABGELAUFEN`.

### ScanLauf (Protokoll)

| Feld | Typ | Bemerkung |
|---|---|---|
| id | Int PK | |
| gestartet / beendet | DateTime | |
| ausloeser | Enum | `ZEITPLAN \| MANUELL` |
| statistik | Json | gefunden / neu / aktualisiert je Phase |
| fehler | Text? | null = erfolgreich |

### Einstellung (Schlüssel-Wert, wie in `stunden`)

| Feld | Typ | Bemerkung |
|---|---|---|
| schluessel | String PK | z. B. `llm_konfig`, `scan_konfig` |
| wert | Json | API-Key verschlüsselt (`apiKeyVerschluesselt`) |

Dazu die üblichen Tabellen des Suite-Musters: `Benutzer` (Auto-Provisioning)
und `Protokoll` (Audit-Log für Freigaben/Ablehnungen/Einstellungsänderungen).

## LLM-Konfiguration (wie im Werkzeug „Stunden")

Übernahme des `stunden`-Musters 1:1:

- **Provider-Factory** (`services/llm/factory.ts`): liest `llm_konfig` aus der
  `Einstellung`-Tabelle, API-Key verschlüsselt gespeichert
  (`lib/krypto.ts` – `verschluesseln`/`entschluesseln`, Schlüssel aus Env),
  Rückfall auf **Dummy-Provider**, wenn keine gültige Konfiguration vorliegt.
- **Einstellungs-Seite im Frontend** (analog Admin-Tab in Stunden):
  Provider-Auswahl, Modell-Feld, API-Key-Feld (Anzeige nur „gesetzt/nicht
  gesetzt", nie der Klartext), Speichern per `PUT /api/einstellungen/llm`.
- **Provider:** `anthropic` (Standard, Modell z. B. `claude-sonnet-4-6`),
  `openai`, `dummy`. **Abweichung von Stunden:** `ollama` entfällt, weil der
  Scanner **providerseitige Websuche** benötigt (Anthropic Web-Search-Tool
  bzw. OpenAI Web Search); ein lokales Modell kann nicht ins Web. Der
  Dummy-Provider liefert deterministische Beispiel-Funde, damit Entwicklung
  und Tests ohne API-Key funktionieren.
- Direkter `fetch` auf die Provider-APIs, kein SDK (wie in Stunden).

## Der Scanner

**Laufzeit:** `node-cron` im foerderungen-Backend. Zeitplan und Aktivierung in
der Einstellungs-Seite konfigurierbar (`scan_konfig`: aktiv ja/nein,
Wochentag + Uhrzeit; Standard: Montag 06:00). Zusätzlich Button
„Scan jetzt starten" in der UI. Es läuft höchstens ein Scan gleichzeitig.

**Zwei Phasen je Lauf:**

1. **Überwachung:** Für jede `AKTIV`e Foerderquelle (gebündelt, wenige pro
   API-Aufruf) sucht das Modell per Websuche nach aktuell offenen
   Ausschreibungen (Titel, Link, Frist, Förderhöhe, Kurzbeschreibung als
   strukturiertes JSON).
2. **Entdeckung:** Offene Suchanfragen aus dem ÖHTB-Profil (Behindertenhilfe,
   taubblinde Menschen, Wohnen, Werkstätten, Wien/Österreich, EU, Stiftungen)
   mit Ausschlussliste der bekannten Quellen → Vorschläge neuer
   Foerderquellen.

**Dedup & Schreiben:** Abgleich gegen Bestand über normalisierten Link, dann
unscharfen Namensvergleich. Neues → `VORGESCHLAGEN`. Geänderte Frist einer
bestehenden Ausschreibung → **Aktualisierungsvorschlag**: neue Zeile im Status
`VORGESCHLAGEN` mit gesetztem `aktualisiertAusschreibungId`; die Prüf-Ansicht
zeigt alt/neu nebeneinander, „Übernehmen" überträgt die Felder auf die
Bestandszeile und löscht den Vorschlag. `ABGELEHNT`e Einträge werden bei
Übereinstimmung übersprungen.
Jeder Lauf schreibt einen `ScanLauf`-Eintrag.

**Fehlerbehandlung:** Fehler (API nicht erreichbar, Quota, ungültiges JSON)
werden je Phase abgefangen, in `ScanLauf.fehler` protokolliert und als
Warnbanner in der UI angezeigt („Letzter Scan fehlgeschlagen am …"). Ein
fehlgeschlagener Scan verändert **nie** Bestandsdaten. Kostenbegrenzung:
feste Batch-Größen, `max_tokens`-Deckel, wöchentlicher Rhythmus.

## Backend-API

Alle Routen unter `/api`, hinter der SSO-Middleware:

- `GET/POST/PATCH /api/quellen` – Foerderquellen inkl. Statuswechsel
  (Freigeben/Ablehnen = PATCH)
- `GET/POST/PATCH /api/ausschreibungen` – analog
- `GET /api/scans` – Verlauf; `POST /api/scans` – manueller Start
  (antwortet sofort, läuft asynchron)
- `GET/PUT /api/einstellungen/llm`, `GET/PUT /api/einstellungen/scan`
- `POST /api/provision` – nur intern (nginx blockt `provision`-Pfade außen;
  bestehende Regex wird um `foerderungen` ergänzt)
- `GET /api/sitzung` – Sitzungs-/Rollenauskunft (Suite-Muster)

## Frontend (React + Vite + Tailwind, deutsch)

Gestaltung **identisch zu den bestehenden Werkzeugen**: dieselbe
`tailwind.config.js` (bewusst duplizierte Design-Tokens: `marke`-Navy,
`erfolg`/`warnung`/`gefahr`), gleiche `Layout.tsx`-/`dialog.tsx`-Konventionen,
gleiche Kopfleiste (marke-900) und Namensgebung wie Portal/Stunden.

Ansichten:

1. **Ausschreibungen** (Startseite): offene Calls nach Frist sortiert,
   Dringlichkeits-Hervorhebung (< 30 Tage: `warnung`, < 7 Tage: `gefahr`),
   Filter für Ebene, Kategorie (Projekt/Kerngeschäft), Themen; „laufend
   einreichbar" als eigener Abschnitt darunter
2. **Förderlandschaft**: Quellen-Katalog mit denselben Filtern, Detailansicht
   mit zugehörigen Ausschreibungen und Bearbeitungsformular
3. **Prüfen**: Vorschlags-Warteschlange (Badge mit Anzahl in der Navigation),
   je Eintrag Quell-Link des Scanners, „Übernehmen"/„Ablehnen"
4. **Scans**: Verlauf, Status des letzten Laufs, „Scan jetzt starten"
5. **Einstellungen**: LLM-Provider/Modell/API-Key, Scan-Zeitplan an/aus

## Suite-Integration (die vier Schritte aus dem README)

1. **Tool-Registry** (`backend/prisma/seed.ts`): slug `foerderungen`, Name
   „Förderungen", Beschreibung „Österreichische Förderlandschaft und
   Ausschreibungsfristen im Blick", rollen `["nutzer"]`, reihenfolge 3,
   provisionUrl `http://foerderungen-app:3003`
2. **nginx** (`nginx/nginx.conf`): `location = /foerderungen` (Redirect) und
   `location /foerderungen/` (Präfix-Strip) nach dem `stunden`-Muster; slug
   in der `provision`-Sperr-Regex ergänzen
3. **docker-compose**: `foerderungen-db` (Postgres, eigenes Volume) und
   `foerderungen-app` (Profil `produktion`, Build-Kontext `./foerderungen`);
   Env: `JWT_SECRET` (gemeinsam), `DATABASE_URL`, `KRYPTO_SECRET`
4. **Entwicklung**: DB per compose, Backend/Frontend per `npm run dev`
   (Backend 3003, eigener Vite-Port), gleiches Dev-`JWT_SECRET`

## Seed-Daten

Das Werkzeug wird mit einem initial recherchierten Katalog der
österreichischen Förderlandschaft ausgeliefert (FSW, Sozialministeriumservice,
Länder-Förderstellen, FFG, aws, ESF+, Erasmus+, Licht ins Dunkel, relevante
Stiftungen, …) als `AKTIV`e Foerderquellen – das Werkzeug ist ab Tag eins
nützlich und der erste Scan hat eine echte Überwachungsliste. Die Recherche
erfolgt während der Umsetzung.

## Tests (vitest, wie im Suite-Backend)

- Unit: Dedup/Matching (Link-Normalisierung, Namensvergleich),
  Fristablauf-Logik (`OFFEN` → `ABGELAUFEN`)
- Integration: Prüf-Ablauf (`VORGESCHLAGEN` → `OFFEN`/`ABGELEHNT`),
  Provision-Endpunkt, Einstellungen (Key nie im Klartext zurückgeben)
- LLM: Dummy-Provider deterministisch → Scanner-Ablauf ohne API-Key testbar
