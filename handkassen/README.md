# ÖHTB Handkassen-System

Digitales System zur revisionssicheren Erfassung und Verwaltung aller
Handkassen-Buchungen. Lokal gehostet, ausschließlich Open-Source-Komponenten.

Die Handkasse ist ein **Tool der OEHTB-Suite**. Betrieb, Anmeldung (SSO über das
Portal), Backup-Container und Updates laufen ausschließlich über die Suite im
übergeordneten Ordner (`docker-compose.yml`, `SERVER - *.bat`, `INSTALL.md`).
In diesem Ordner liegt nur der Code des Tools plus eine Entwicklungs-Datenbank.

## Tech-Stack

| Schicht    | Technologie                                   |
|------------|-----------------------------------------------|
| Frontend   | React + Vite + TypeScript + Tailwind          |
| Backend    | Node.js + Express + TypeScript                |
| Datenbank  | PostgreSQL + Prisma ORM                       |
| Auth       | Suite-SSO (JWT-Cookie vom Portal, Rollen je Tool) |
| PDF        | pdfkit (serverseitig)                         |
| Betrieb    | Docker + Docker Compose (über die Suite)      |

## Projektstruktur

```
handkassen/
├── CLAUDE.md              Leitplanken für die KI-gestützte Entwicklung
├── docker-compose.yml     NUR die Entwicklungs-Datenbank (kein App-/Backup-Dienst)
├── backup/                Backup-/Restore-Skripte, vom Suite-Backup-Container gemountet
├── BACKUP.md              Backup-Konzept und Wiederherstellung
├── BENUTZERHANDBUCH.md    Handbuch für Anwender:innen
├── backend/               Express-API, Prisma-Schema, Geschäftslogik
│   ├── .env.example       Vorlage für die lokale Backend-Konfiguration
│   ├── Dockerfile         Produktions-Image (wird vom Suite-Compose gebaut)
│   ├── prisma/schema.prisma
│   └── src/
│       ├── lib/           DB-Client, Suite-Auth, Buchungslogik, Audit
│       ├── middleware/    Authentifizierung & Rollenprüfung
│       └── routes/        REST-Endpunkte je Modul
└── frontend/              React-Oberfläche
    └── src/
        ├── components/    wiederverwendbare UI-Bausteine
        ├── pages/         Seiten (Buchungen, Abschluss, Berichte, Verwaltung …)
        └── lib/           API-Client, Hilfsfunktionen
```

## Entwicklung

Voraussetzungen: Node.js 20+, Docker Desktop. Die Anmeldung läuft auch in der
Entwicklung über das Suite-Portal (Ordner `backend/` und `portal/` im Suite-Root),
weil dieses Tool kein eigenes Login mehr hat.

1. Entwicklungs-Datenbank starten (in diesem Ordner):
   ```bash
   docker compose up -d
   ```
   Daten liegen im Ordner `postgres-data/` (nicht im Repo).

2. Backend einrichten:
   ```bash
   cd backend
   cp .env.example .env         # JWT_SECRET muss zum Portal passen
   npm install
   npx prisma migrate dev       # Schema anlegen
   npm run seed                 # Kontenplan + Demo-Stammdaten
   npm run dev                  # API auf http://localhost:3001
   ```

3. Frontend starten:
   ```bash
   cd frontend
   npm install
   npm run dev                  # UI auf http://localhost:5173
   ```

## Produktivbetrieb

Nur über die Suite im übergeordneten Ordner:

```
SERVER - Starten.bat / SERVER - Aktualisieren.bat   (Suite-Root)
```

Das Suite-Compose baut das Image aus `backend/Dockerfile`, startet die
Datenbank `handkassen-db`, die App `handkassen-app` und den Backup-Dienst
`handkassen-backup`. Datenbank und Belegfotos liegen in den Docker-Volumes
`handkassen_db_data` und `handkassen_belege_data`. Details: `../INSTALL.md`,
Backup und Wiederherstellung: `BACKUP.md`.

## Tests

Im `backend`-Ordner:

```bash
# Unit-Tests (ohne Datenbank) – Buchungslogik, Geld, Sperre, BMD-Zuordnung
npm test

# Integrationstests (API gegen eine SEPARATE Testdatenbank)
docker compose up -d             # Dev-Datenbank muss laufen (im Ordner handkassen/)
npm run test:db-vorbereiten      # einmalig: Schema in "handkassen_test" anlegen
npm run test:integration         # Auth, Buchungen, Abschluss-Workflow, Sperren
```

Die Integrationstests laufen nur, wenn `TEST_DATABASE_URL` gesetzt ist (das
erledigt `test:integration`); ohne diese Variable überspringt `npm test` sie
automatisch und berührt **niemals** die Entwicklungs-/Produktiv-Datenbank.

## Wichtige Konventionen

- **Geldbeträge immer in Cent (Ganzzahl).** Anzeige-Formatierung erst im Frontend.
- Jede datenändernde Aktion erzeugt einen `audit_log`-Eintrag.
- Siehe `CLAUDE.md` für die vollständigen Domänen- und Entwicklungsregeln.
