# OEHTB-Suite

Gemeinsame Oberfläche für die ÖHTB-Tools mit **zentralem Login (SSO)** und einer
**Rechteverwaltung**, die pro Tool festlegt, *wer hinein darf* und *mit welcher
Rolle*. Erweiterbar um weitere Tools.

Enthaltene Tools:
- **Verwaltung** (Portal-eigen): Benutzer + Zugriffsmatrix + Protokoll
- **Handkassen** (Unterordner `handkassen/`)
- **Stunden** (Unterordner `stunden/`)
- **Förderungen** (Unterordner `foerderungen/`)

Alles liegt in **diesem einen Ordner** – die Tools sind als Unterordner
enthalten, die Build-Kontexte in `docker-compose.yml` zeigen nach innen
(`./handkassen`, `./stunden`). Der Ordner ist damit als Ganzes deploybar
(kopieren/klonen, ein `docker compose up`).

## Architektur

```
                nginx (Port 80, einziger veröffentlichter Port)
                ├── /            → Portal (Suite-Backend :3000, liefert SPA + /api/suite)
                ├── /handkassen/ → Handkassen :3001   (Präfix wird gestrippt)
                ├── /stunden/    → Stunden    :3002   (Präfix wird gestrippt)
                └── /foerderungen/ → Förderungen :3003 (Präfix wird gestrippt)
```

- **Ein Cookie `suite_token`** (Path=/) für Portal und alle Tools; ein
  gemeinsames `JWT_SECRET`. Das Portal ist die Quelle der Wahrheit für Benutzer
  und Rechte. Jedes Tool leitet seine Rolle aus `zugriff[<tool>]` ab und legt
  bei Bedarf eine lokale Benutzer-Zeile an (Auto-Provisioning, für FKs/Audit).
- Rechteänderungen wirken binnen ~1 Minute (Tools frischen ihr Token beim
  Portal auf) bzw. sofort beim nächsten Login.
- **Neues Tool anbinden:** Tool wie gehabt bauen (SSO-Middleware + Base-Pfad
  nach dem Muster von `stunden`), in der Tool-Registry (`prisma/seed.ts`)
  eintragen, `location`-Block in `nginx/nginx.conf` ergänzen, Service in
  `docker-compose.yml` aufnehmen.

## Entwicklung

Nur die Suite-Datenbank läuft in Docker; Backends/Frontends laufen per `npm run dev`.

```
# 1. Suite-DB starten
docker compose up -d suite-db

# 2. Suite-Backend
cd backend && npm install && cp .env.example .env
npx prisma migrate deploy && npm run seed && npm run dev      # http://localhost:3000

# 3. Portal-Frontend (zweites Terminal)
cd portal && npm install && npm run dev                       # http://localhost:5175

# 4. Tools wie gewohnt starten (handkassen, stunden, foerderungen) – WICHTIG: in
#    deren backend/.env dasselbe JWT_SECRET wie im Portal setzen (dev: "dev-secret").
#    Foerderungen (viertes Tool): Dev-DB auf Port 5435, Backend auf :3003,
#    Frontend (Vite) auf :5176.
```

Anmeldung im Portal: `admin` / `admin123` (Seed – vor Produktivbetrieb ändern).
Da Cookies auf `localhost` portübergreifend gelten, funktioniert das SSO in der
Entwicklung auch über die verschiedenen Vite-Ports.

## Produktion

Alles per Docker Compose (Muster wie Handkassen: Profil `produktion`):

```
cp .env.example .env    # Werte setzen (JWT_SECRET, DB-Passwörter, …)
docker compose --profile produktion up -d --build
```

Erreichbar auf **Port 80**. HTTPS über Tailscale/Reverse-Proxy davor:
`tailscale serve --bg https / http://localhost:80`.

Cutover einer bestehenden Handkassen-Installation und Bestandsnutzer-Import:
siehe **INSTALL.md**.
