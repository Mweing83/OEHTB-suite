# ÖHTB Handkassen-System

Digitales System zur revisionssicheren Erfassung und Verwaltung aller
Handkassen-Buchungen. Lokal gehostet, ausschließlich Open-Source-Komponenten.

## Tech-Stack

| Schicht    | Technologie                          |
|------------|--------------------------------------|
| Frontend   | React + Vite + TypeScript + Tailwind |
| Backend    | Node.js + Express + TypeScript       |
| Datenbank  | PostgreSQL + Prisma ORM              |
| Auth       | bcrypt + JWT (HttpOnly-Cookie)       |
| PDF        | pdfkit (serverseitig)                |
| Betrieb    | Docker + Docker Compose              |

## Projektstruktur

```
handkassen/
├── CLAUDE.md              Leitplanken für die KI-gestützte Entwicklung
├── docker-compose.yml     App + PostgreSQL als Verbund
├── .env.example           Vorlage für Umgebungsvariablen
├── backend/               Express-API, Prisma-Schema, Geschäftslogik
│   ├── prisma/schema.prisma
│   └── src/
│       ├── lib/           DB-Client, Auth, Buchungslogik, Audit
│       ├── middleware/    Authentifizierung & Rollenprüfung
│       └── routes/        REST-Endpunkte je Modul
└── frontend/              React-Oberfläche
    └── src/
        ├── components/    wiederverwendbare UI-Bausteine
        ├── pages/         Seiten (Login, Buchungen, Abschluss …)
        └── lib/           API-Client, Hilfsfunktionen
```

## Schnellstart (Entwicklung)

Voraussetzungen: Node.js 20+, Docker, Docker Compose.

1. Umgebungsvariablen anlegen:
   ```bash
   cp .env.example .env
   ```
   Werte in `.env` anpassen (insb. `JWT_SECRET`).

2. Datenbank starten:
   ```bash
   docker compose up -d db
   ```

3. Backend einrichten:
   ```bash
   cd backend
   npm install
   npx prisma migrate dev      # Schema anlegen
   npm run seed                # Kontenplan + Demo-Daten
   npm run dev                 # API auf http://localhost:3001
   ```

4. Frontend starten:
   ```bash
   cd frontend
   npm install
   npm run dev                 # UI auf http://localhost:5173
   ```

## Produktivbetrieb (gesamter Verbund)

```bash
docker compose up -d --build
```

Startet PostgreSQL und die Anwendung gemeinsam. Belegfotos und Datenbank werden
in Docker-Volumes gehalten und müssen in die Datensicherung einbezogen werden.

## Demo-Zugänge (nur Entwicklung, nach Seed)

| Benutzer | Passwort   | Rolle    |
|----------|------------|----------|
| admin    | admin123   | admin    |
| leitung  | leitung123 | leitung  |
| erfasser | erfass123  | erfasser |

> Diese Zugänge sind ausschließlich für die lokale Entwicklung gedacht und vor
> dem Produktivbetrieb zu entfernen bzw. zu ändern.

## Tests

Im `backend`-Ordner:

```bash
# Unit-Tests (ohne Datenbank) – Buchungslogik, Geld, Sperre, BMD-Zuordnung
npm test

# Integrationstests (API gegen eine SEPARATE Testdatenbank)
docker compose up -d db          # Datenbank muss laufen
npm run test:db-vorbereiten      # einmalig: Schema in "handkassen_test" anlegen
npm run test:integration         # Auth, Buchungen, Abschluss-Workflow, Sperren
```

Die Integrationstests laufen nur, wenn `TEST_DATABASE_URL` gesetzt ist (das
erledigt `test:integration`); ohne diese Variable überspringt `npm test` sie
automatisch und berührt **niemals** die Entwicklungs-/Produktiv-Datenbank.

### Automatische Prüfung vor jedem Commit (empfohlen)

Es gibt einen Git-Hook, der vor jedem Commit die Backend-Unit-Tests ausführt und
den Commit abbricht, falls ein Test fehlschlägt. **Einmalig pro Klon aktivieren:**

```bash
git config core.hooksPath .githooks
```

Der Hook (`.githooks/pre-commit`) läuft nur, wenn `backend/`-Dateien im Commit
sind, und nur die schnellen Unit-Tests (keine Datenbank nötig). Im Notfall lässt
er sich mit `git commit --no-verify` umgehen.

## Wichtige Konventionen

- **Geldbeträge immer in Cent (Ganzzahl).** Anzeige-Formatierung erst im Frontend.
- Jede datenändernde Aktion erzeugt einen `audit_log`-Eintrag.
- Siehe `CLAUDE.md` für die vollständigen Domänen- und Entwicklungsregeln.
