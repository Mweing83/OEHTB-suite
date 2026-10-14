# Stunden-Tool ÖHTB

Web-Tool zur Verwaltung von Wochenstunden und Beschäftigungsausmaß (%).
Die Architektur ist unten im Abschnitt Projektstruktur beschrieben.

## Erststart (Phase 1: Gerüst)

### 1. Datenbank starten (Docker)
Docker Desktop muss laufen.
```
cd C:\myProjects\OEHTB\stunden
docker compose up -d db
```
Die Datenbank läuft auf Port **5433** (nicht 5432, um Konflikte zu vermeiden).

### 2. Backend einrichten
```
cd backend
npm install
```

Prisma-Client erzeugen und Migration anlegen:
```
npx prisma generate
npx prisma migrate dev --name init
```
> **ARM64-Hinweis 1 (EPERM):** Falls `prisma generate` einen EPERM-Fehler
> bringt, zuerst das laufende Backend stoppen, dann den Befehl erneut
> ausführen. Diese Befehle müssen im Ordner `backend/` laufen, nicht im
> Projekt-Root.
>
> **ARM64-Hinweis 2 (Engine-Inkompatibilität):** Auf Windows ARM64
> (Snapdragon/Copilot+ PC) lädt Prisma sonst die x64-Engine und stürzt beim
> Start mit "query_engine-windows.dll.node is not a valid Win32 application"
> ab. Gelöst durch `engineType = "binary"` und `binaryTargets = ["native",
> "windows"]` im `schema.prisma` (Binary-Engine läuft per Emulation). Falls
> der Fehler doch auftritt: `node_modules\.prisma` löschen und
> `npx prisma generate` (bei gestopptem Backend) erneut ausführen.

Testdaten + Admin-Benutzer anlegen:
```
npm run seed
```

Backend starten:
```
npm run dev
```
Läuft auf http://localhost:3002

### 3. Frontend einrichten (zweites Terminal)
```
cd C:\myProjects\OEHTB\stunden\frontend
npm install
npm run dev
```
Läuft auf http://localhost:5174

### 4. Anmelden
Browser öffnen: http://localhost:5174
- E-Mail: `admin@oehtb.local`
- Passwort: `admin123`

**Wichtig:** Dieses Passwort ist nur für die Entwicklung. Vor dem
Produktivbetrieb ändern.

## Ports im Überblick
| Dienst     | Port  | Hinweis                              |
|------------|-------|--------------------------------------|
| PostgreSQL | 5433  | abweichend von Standard 5432         |
| Backend    | 3002  | abweichend von Handkassen (3001)     |
| Frontend   | 5174  | Vite Dev-Server                      |

## Projektstruktur
```
stunden/
├── docker-compose.yml
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── index.ts
│       ├── lib/         <- prisma, krypto, audit
│       ├── middleware/  <- auth
│       └── routes/      <- auth (weitere folgen)
└── frontend/
    └── src/
        ├── App.tsx
        ├── lib/         <- api, auth
        └── pages/       <- LoginSeite, DashboardSeite
```
