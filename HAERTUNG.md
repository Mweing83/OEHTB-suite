# Server-Härtung der OEHTB-Suite

Diese Checkliste schützt die **Geheimnisse in der `.env`** (JWT-Secret, DB-Passwörter,
Provisionierungs-Secret, Verschlüsselungs-Schlüssel) auf dem Produktivserver.

**Grundsatz:** Bei einer selbst-gehosteten Docker-Compose-Anwendung müssen die
Container die Secrets zur Laufzeit lesen können. Wer **Host-/Administrator-Zugriff**
auf den Server hat, kommt daher immer an die Werte. „Absichern" heißt: die
realistischen Leck-Wege schließen — Diebstahl/Ausmusterung der Platte, geleakte
Backups, andere Konten am Host, versehentliches Commit.

Bereits im Projekt gelöst (nichts zu tun):
- `.env` ist **gitignored** und wird nicht versioniert (nur `*.env.example` liegen im Repo).
- Die **automatischen Backups** sichern nur Datenbank + Belege, **nicht** die `.env`.

---

## Automatisch: `SERVER - Haerten.bat`

Einmalig auf dem Server ausführen (am besten **als Administrator**). Das Skript ist
idempotent und kann jederzeit erneut laufen. Es:

1. setzt restriktive Dateirechte auf die `.env` (nur Administratoren, SYSTEM und das
   aktuelle Konto dürfen lesen — geerbte Rechte werden entfernt),
2. prüft den **BitLocker**-Status des Systemlaufwerks,
3. kontrolliert, dass die `.env` nicht in Git getrackt ist.

> Läuft die Suite unter einem **anderen** Dienst-/Benutzerkonto als dem, mit dem du
> `SERVER - Haerten.bat` startest, gib diesem Konto zusätzlich Leserecht auf die `.env`
> (`icacls .env /grant:r "KONTO:R"`), sonst kann `docker compose` sie nicht mehr lesen.

---

## Manuell: die wichtigen Restschritte

### 1. Festplattenverschlüsselung (BitLocker) — größter Hebel
Schützt gegen den realistischsten Fall: Jemand bekommt die **Platte** (Diebstahl,
Reparatur/RMA, Ausmusterung). Ohne Verschlüsselung ist die `.env` dann im Klartext lesbar.

```powershell
manage-bde -status C:                 # Status prüfen
manage-bde -on C: -RecoveryPassword   # aktivieren (oder GUI: "Gerät verschlüsseln")
```

- Ist ein TPM vorhanden, entsperrt der Server beim Booten automatisch — **unbeaufsichtigte
  Neustarts funktionieren weiter**.
- **Wichtig:** Den Wiederherstellungsschlüssel **außerhalb** des Servers sichern
  (Passwort-Manager / ausgedruckt im Safe). Ohne ihn sind die Daten bei einem
  TPM-/Hardware-Wechsel verloren.

### 2. Backup-Medien ebenfalls verschlüsseln
NAS-/USB-Backup-Laufwerke enthalten die Datenbank (und damit sensible Daten). Diese
Medien verschlüsseln (BitLocker To Go für USB) oder physisch sicher verwahren.

### 3. Ganzen Projektordner nie unverschlüsselt kopieren
Der einzige verbleibende Weg, die `.env` aus dem Haus zu tragen, ist ein **manuelles
Kopieren des kompletten `OEHTB-Suite`-Ordners** (z. B. auf NAS/USB/Cloud). Wenn nötig:
die `.env` vorher ausnehmen **oder** das Archiv verschlüsseln.

### 4. Server-Zugang absichern
Wer sich am Server anmelden oder `docker exec` ausführen kann, hat vollen Zugriff.
Daher: wenige Administrator-Konten, starke Login-Passwörter, System aktuell halten,
Fernzugriff (RDP) nur über VPN/Tailscale, nicht offen ins Internet.

---

## Wenn doch ein Secret ausgetreten ist: Rotation

- **Alle Secrets neu erzeugen:** alte `.env` umbenennen, dann `SERVER - Einrichten.bat`.
- **DB-Passwörter** rotieren ist einfach: Wert in `.env` ändern → Container neu starten.
  Die Datenbank gleicht das Passwort beim Start automatisch an die `.env` an
  (Selbstheilung in `docker-compose.yml`).
- **`JWT_SECRET` / `PROVISION_SECRET`** rotieren: in `.env` ändern → alle Apps neu
  starten. Das macht **alle aktiven Sitzungen ungültig** (gewollt).
- **Ausnahme — `STUNDEN_ENCRYPTION_KEY` und `FOERDERUNGEN_ENCRYPTION_KEY`:**
  **nicht beiläufig ändern.** Mit ihnen sind die in den Tools gespeicherten
  KI-API-Keys verschlüsselt — ein neuer Schlüssel macht diese unlesbar. Diese beiden
  Werte am strengsten hüten und sicher sichern.

---

## Kurz-Checkliste

- [ ] `SERVER - Haerten.bat` als Administrator ausgeführt (`.env`-Rechte gesetzt)
- [ ] BitLocker auf dem Systemlaufwerk aktiv, Wiederherstellungsschlüssel extern gesichert
- [ ] Backup-Medien (NAS/USB) verschlüsselt oder physisch sicher
- [ ] `.env` wird nirgends unverschlüsselt weiterkopiert
- [ ] Wenige Admin-Konten, Fernzugriff nur über VPN/Tailscale
- [ ] `.env` (v. a. die beiden `ENCRYPTION_KEY`) in einem Passwort-Manager gesichert
