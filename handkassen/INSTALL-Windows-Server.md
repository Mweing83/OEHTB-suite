# Installation & Betrieb auf Windows Server (mit Tailscale)

Diese Anleitung beschreibt die produktive Einrichtung des ÖHTB
Handkassen-Systems auf einem Windows-Server. Sie begleitet das geführte
Skript `setup-server.ps1`, das die Routinearbeit übernimmt.

> Kurzfassung: Voraussetzungen installieren → `setup-server.ps1` als
> Administrator ausführen → Tailscale anmelden und freigeben → in der App die
> Demo-Zugänge ersetzen. Danach läuft alles unter einer HTTPS-Adresse.

---

## 1. Wie das System im Betrieb aufgebaut ist

- **Eine Adresse, ein Port (Single-Origin):** Das Backend liefert sowohl die
  Web-Oberfläche als auch die API auf Port **3001** aus. Es gibt keinen
  separaten Frontend-Server.
- **Container (Docker):** PostgreSQL (Datenbank), die Anwendung (`app`) und die
  Datensicherung (`backup`) laufen als Docker-Container und starten dank
  `restart: unless-stopped` automatisch neu.
- **HTTPS über Tailscale:** Tailscale stellt die App verschlüsselt unter einer
  Adresse wie `https://<servername>.<tailnet>.ts.net` bereit. TLS wird von
  Tailscale erledigt – es sind keine eigenen Zertifikate nötig.

---

## 2. Voraussetzungen

Auf dem Server werden benötigt:

1. **Docker** mit Docker Compose.
2. **Tailscale** (für den HTTPS-Zugriff).
3. Die Projektdateien (dieser Ordner) auf dem Server – per Git-Clone oder als
   Kopie.

> **Wichtiger Hinweis zu Docker auf Windows Server:** Docker *Desktop* ist an
> eine angemeldete Benutzersitzung gebunden und für reine Server ohne ständige
> Anmeldung nicht ideal. Für unbeaufsichtigten Dauerbetrieb sind besser geeignet:
> der native Docker-Dienst (Mirantis/Docker CE für Windows) **oder** der Betrieb
> in einer Linux-VM/WSL2 mit Docker. Welche Variante zu eurer Umgebung passt,
> entscheidet die IT. Das Setup-Skript prüft nur, ob Docker läuft – es schreibt
> die Docker-Installationsart nicht vor.

Das Skript kann Docker und Tailscale auf Wunsch per `winget` installieren,
sofern `winget` vorhanden ist. Andernfalls bitte vorab manuell installieren.

---

## 3. Einrichtung mit dem Skript

1. Projektordner auf den Server bringen.
2. **PowerShell als Administrator** öffnen, in den Projektordner wechseln.
3. Skript starten:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\setup-server.ps1
   ```

Das Skript führt geführt durch folgende Schritte und fragt an wichtigen Stellen nach:

- prüft Projektdateien und Docker (startet Docker Desktop bei Bedarf),
- erzeugt `.env` aus der Vorlage,
- erzeugt automatisch ein sicheres **`JWT_SECRET`**,
- setzt auf Wunsch ein sicheres **Datenbank-Passwort** (`POSTGRES_PASSWORD`),
- trägt optional NAS-/USB-Sicherungspfade ein,
- **baut und startet** alle Container (`docker compose --profile produktion up -d --build`),
- wartet auf den Health-Check (`http://localhost:3001/api/health`),
- hilft bei der **Tailscale**-Freigabe.

> Das Skript überschreibt vorhandene Geheimnisse **nicht** ungefragt und löscht
> **keine** Demo-Zugänge. Es lässt sich gefahrlos erneut ausführen.

---

## 4. Tailscale (HTTPS) einrichten

Falls noch nicht geschehen:

1. Anmelden (einmalig, interaktiv):
   ```powershell
   tailscale up
   ```
2. In der **Tailscale-Admin-Konsole** „HTTPS Certificates" (MagicDNS) für das
   Tailnet aktivieren.
3. Die App über HTTPS bereitstellen:
   ```powershell
   tailscale serve --bg https / http://localhost:3001
   ```
   Prüfen mit `tailscale serve status`. (Die genaue Syntax kann je nach
   Tailscale-Version leicht abweichen – im Zweifel `tailscale serve --help`.)

Danach ist die App unter `https://<servername>.<tailnet>.ts.net` erreichbar.
Weil hinter Tailscale TLS terminiert wird, ist im `app`-Container bereits
`TRUST_PROXY=1` gesetzt, damit das sichere Login-Cookie korrekt funktioniert.

---

## 5. Geheimnisse (in `.env`)

Die Datei `.env` im Projektordner enthält die Betriebsgeheimnisse. Sie ist über
`.gitignore` vom Repository ausgeschlossen und darf **nicht** weitergegeben werden.

- `JWT_SECRET` – langer Zufallswert für die Anmelde-Token (vom Skript erzeugt).
- `POSTGRES_PASSWORD` – Datenbank-Passwort. **Muss vor dem ersten Start gesetzt
  sein**, da PostgreSQL es nur bei der erstmaligen Initialisierung übernimmt.
- `BACKUP_NAS` / `BACKUP_USB` – echte Ablageorte der Sicherungen.

Nachträgliche Änderung des Datenbank-Passworts erfordert das Neu-Initialisieren
der Datenbank (Daten gehen dabei verloren) – daher gleich zu Beginn richtig setzen.

---

## 6. Erste Anmeldung und Demo-Zugänge entfernen

Direkt nach der Einrichtung als `admin` / `admin123` anmelden und **sofort**:

1. eigenes Passwort ändern (oben rechts „Passwort ändern"),
2. echte Benutzer anlegen (Verwaltung → Benutzer),
3. die Demo-Zugänge `admin`, `leitung`, `erfasser` deaktivieren.

Solange die Demo-Zugänge aktiv sind, ist das System nicht sicher.

---

## 7. Datensicherung

- Zeitplan, Aufbewahrung und aktive Ziele werden in der App unter
  **Verwaltung → System → Datensicherung** verwaltet.
- Die Ablageorte (lokal/NAS/USB) stehen in `.env`. Nach Änderung die Container
  neu starten: `docker compose --profile produktion up -d`. (In der App lässt sich
  nur der lokale Anzeige-Pfad für die Sicherungsliste setzen, nicht das Sicherungsziel.)
- Eine Übersicht und die Funktion „Sicherung prüfen" gibt es ebenfalls im
  Datensicherungs-Tab.
- Zum Wiederherstellen siehe `BACKUP.md` bzw. `restore.ps1` /
  „Handkassen wiederherstellen.bat".

### 7.1 NAS-Zugriff mit Anmeldedaten einrichten

Der Backup-Container schreibt auf den Pfad, der in `BACKUP_NAS` (`.env`) steht.
Damit er die NAS-Freigabe erreicht, muss **der Windows-Server** das Laufwerk
dauerhaft gemappt haben — Docker sieht es dann als normalen Ordner.

**Einmalige Einrichtung (PowerShell als Administrator):**

```powershell
# 1. Zugangsdaten im Windows-Anmeldedaten-Manager speichern (überlebt Reboots)
cmdkey /add:\\nas-server\sicherung /user:nas-benutzer /pass:geheimes-passwort

# 2. Laufwerk dauerhaft mappen
net use Z: \\nas-server\sicherung /persistent:yes

# 3. Unterordner anlegen (einmalig)
New-Item -ItemType Directory -Force -Path "Z:\handkassen-backup"

# 4. Pfad in .env eintragen
#    BACKUP_NAS=Z:\handkassen-backup
```

`\\nas-server\sicherung`, `nas-benutzer`, `Z:` und das Passwort durch
die tatsächlichen Werte ersetzen.

**Docker Desktop: Laufwerk freigeben**

Damit der Docker-Container auf `Z:` zugreifen kann, muss das Laufwerk in
Docker Desktop freigegeben sein:
_Settings → Resources → File sharing → `Z:\` hinzufügen → „Apply & Restart"._

**Wichtig – Dienst-Kontext:**

Das `net use`-Mapping gilt für den Benutzer, der es einrichtet. Wenn Docker als
Windows-Dienst unter `SYSTEM` oder einem anderen Konto läuft (nicht Docker
Desktop), muss das Mapping für dieses Konto gelten. Am einfachsten: einen
**Windows-Aufgabenplaner-Task** erstellen, der das `net use`-Kommando beim
Systemstart unter dem richtigen Konto ausführt.

**Ergebnis in `.env`:**

```
BACKUP_NAS=Z:\handkassen-backup
```

Danach Container neu starten:

```powershell
docker compose --profile produktion up -d
```

Das Einrichtungs-Skript `setup-server.ps1` bietet diesen Schritt geführt an.

---

## 8. Updates einspielen

1. Neuen Stand holen (z. B. `git pull`).
2. Neu bauen und starten:
   ```powershell
   docker compose --profile produktion up -d --build
   ```
   Datenbank-Migrationen werden beim Start des `app`-Containers automatisch
   angewendet (`prisma migrate deploy`). Datenbank und Belegfotos liegen in
   Docker-Volumes und bleiben dabei erhalten.

---

## 9. Autostart nach Server-Neustart

Die Container starten automatisch neu, **sobald Docker läuft**. Entscheidend ist
also, dass der Docker-Dienst nach einem Server-Neustart selbst startet:

- Mit nativem Docker-Dienst (empfohlen für Server): Docker als Windows-Dienst auf
  „automatisch" – die Container kommen dann ohne Anmeldung hoch.
- Mit Docker Desktop: ist an eine Benutzeranmeldung gebunden; für echten
  Serverbetrieb nur eingeschränkt geeignet (siehe Hinweis in Abschnitt 2).

---

## 10. Fehlersuche

- Status der Container: `docker compose --profile produktion ps`
- Logs der Anwendung: `docker compose --profile produktion logs -f app`
- Logs der Datenbank: `docker compose --profile produktion logs -f db`
- Health-Check: im Browser `http://localhost:3001/api/health` → `{"status":"ok"}`
- Alles stoppen: `docker compose --profile produktion down`
  (Daten bleiben in den Volumes erhalten.)
