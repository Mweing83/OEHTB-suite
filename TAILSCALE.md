# HTTPS-Fernzugriff über Tailscale

Macht die Suite verschlüsselt (HTTPS) unter einer festen Adresse
`https://<name>.<tailnet>.ts.net` erreichbar — ohne eigene Zertifikate. Das
behebt das Klartext-HTTP-/`COOKIE_INSECURE`-Thema aus der Sicherheitsbewertung.

## Was automatisch läuft und was einmalig manuell bleibt

Vollständig ohne Eingriff geht es **nicht** — ein Server muss dem Tailnet
beweisen, dass er beitreten darf. Das ist ein einmaliges Geheimnis (Auth-Key).
Alles andere erledigt `SERVER - Tailscale.bat`.

**Einmalig manuell (in der Tailscale-Admin-Konsole, https://login.tailscale.com):**
1. **Auth-Key erzeugen:** *Settings → Keys → Generate auth key*. Empfehlung:
   „Reusable" aus, „Ephemeral" aus (Server soll dauerhaft im Tailnet bleiben),
   optional ein Tag. Den Key in die `.env` eintragen:
   ```
   TAILSCALE_AUTHKEY=tskey-...
   ```
   (Die `.env` ist durch `SERVER - Haerten.bat` vor fremdem Lesen geschützt.)
2. **HTTPS aktivieren:** *DNS → HTTPS Certificates* (MagicDNS) einschalten.
   Danach stellt Tailscale die Zertifikate selbst aus.

**Voraussetzung:** Der Server braucht Internet (Tailscale-Koordination +
Zertifikate). Clients müssen im selben Tailnet angemeldet sein.

## Ausführen

`SERVER - Tailscale.bat` **als Administrator** starten. Das Skript:
- installiert Tailscale, falls nicht vorhanden (winget, sonst MSI),
- meldet den Server unbeaufsichtigt am Tailnet an (Auth-Key aus der `.env`),
- richtet die dauerhafte HTTPS-Weiterleitung auf die Suite ein
  (`tailscale serve` → `http://localhost:80`),
- gibt die fertige `https://…ts.net`-Adresse aus.

Idempotent: mehrfaches Ausführen ist unbedenklich. Nach dem ersten Lauf startet
der Tailscale-Dienst mit Windows und hält Anmeldung + Weiterleitung dauerhaft.

## Letzter Schritt: sichere Cookies aktivieren

Sobald der Zugriff über HTTPS läuft, die Suite auf `secure`-Cookies umstellen:
1. In der `.env` die Zeile `COOKIE_INSECURE=1` **entfernen oder auskommentieren**.
2. Suite neu starten: `SERVER - Starten.bat`
   (oder `docker compose --profile produktion up -d`).

Danach werden die Session-Cookies nur noch über HTTPS gesetzt (an die
verschlüsselte Verbindung gebunden) — das schließt das Abfangen von Sitzungen
im Netz.

## Fehlerbehebung

- **`tailscale serve` schlägt fehl:** Meist ist HTTPS im Tailnet noch nicht
  aktiviert → Schritt 2 oben nachholen, dann `SERVER - Tailscale.bat` erneut.
  Aktuelle Weiterleitung prüfen: `"C:\Program Files\Tailscale\tailscale.exe" serve status`.
- **„Kein TAILSCALE_AUTHKEY":** Auth-Key in die `.env` eintragen (siehe oben) —
  oder einmalig interaktiv anmelden:
  `"C:\Program Files\Tailscale\tailscale.exe" up`.
- **Auth-Key abgelaufen:** Auth-Keys haben ein Ablaufdatum. Für die
  Erstinstallation genügt ein frischer Key; der Server bleibt danach angemeldet.
  Bei einer Neuinstallation einen neuen Key erzeugen.
- **Status ansehen:** `"C:\Program Files\Tailscale\tailscale.exe" status`.
