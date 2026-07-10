# CHECKLISTE – Produktivgang Stunden-Tool ÖHTB

Stand: Alle Bauphasen (1–7) abgeschlossen. Diese Liste sammelt, was vor dem
echten Einsatz noch zu erledigen ist.

## Technische Sicherheit (vor Produktivbetrieb zwingend)

- [ ] **JWT_SECRET** in `backend/.env` durch einen langen Zufallswert ersetzen
      (aktuell Entwicklungswert). Z. B. mit `openssl rand -base64 48`.
- [ ] **ENCRYPTION_KEY** in `backend/.env` durch einen eigenen 32-Zeichen-Wert
      ersetzen. WICHTIG: Wird dieser Wert nachträglich geändert, lassen sich
      bereits gespeicherte API-Keys und IMAP-Passwörter nicht mehr entschlüsseln
      und müssen neu eingegeben werden.
- [ ] **Admin-Passwort** ändern (Standard `admin123` aus dem Seed).
- [ ] **Cookie secure-Flag**: In `backend/src/middleware/auth.ts` `secure: true`
      setzen, sobald die Anwendung über HTTPS läuft.
- [ ] **Datenbank-Passwort** in `docker-compose.yml` und `.env` ändern
      (Standard `stunden_dev_passwort`).
- [ ] HTTPS / Reverse Proxy vor die Anwendung setzen.

## DSGVO / Organisatorisch

- [ ] **AVV/DPA** mit dem gewählten Cloud-KI-Anbieter (Anthropic oder OpenAI)
      abschließen, EU-Region bestätigen. Alternativ auf lokales Ollama-Modell
      umstellen – dann verlässt kein Text das Haus und es ist kein AVV nötig.
- [ ] Eintrag im **Verarbeitungsverzeichnis** ergänzen.
- [ ] **Aufbewahrungsfristen** für die Beschäftigungshistorie arbeitsrechtlich
      klären und dokumentieren.
- [ ] Lösch-/Anonymisierungskonzept mit der Verwaltung abstimmen.
- [ ] Mitarbeiter über die Datenverarbeitung informieren (Informationspflicht).

## Daten & Konfiguration

- [ ] **Referenz-Wochenstunden (100 %)** im Admin-Tab prüfen/setzen
      (Standard 38,5). Wird für die KI-Umrechnung Stunden ↔ Prozent verwendet;
      der Wert in `backend/src/services/llm/typen.ts` (VOLLZEIT_STUNDEN) dient
      nur noch als Vorgabe/Rückfall.
- [ ] **Initiale Stammdaten** importieren (aus der alten Excel-Datei).
- [ ] KI-Provider im Admin-Tab final konfigurieren: Anbieter wählen und je nach
      Wahl Cloud-Key + Modell (Anthropic/OpenAI) bzw. Endpoint + Modell (Ollama).
- [ ] Bestätigungs-Modus festlegen (Empfehlung: erst "immer manuell").
- [ ] IMAP-Postfach konfigurieren, sobald Zugangsdaten vom Dienstleister da sind.
- [ ] Echte Benutzer mit passenden Rollen anlegen, Test-Admin ggf. deaktivieren.

## Funktionaler Überblick (fertig gebaut)

- [x] Anmeldung mit Rollen (Admin / Sachbearbeiter / Leser), Inaktivitäts-Timeout
- [x] Dashboard: aktueller Stand aller Mitarbeiter + anstehende Änderungen
- [x] Mitarbeiterverwaltung + Detailseite mit vollständiger Historie
- [x] Manuelle Erfassung von Beschäftigungsänderungen (revisionssicher)
- [x] Anfragen-Workflow: Paste-Feld, Pseudonymisierung, KI-Parsing, Queue
- [x] Bestätigen/Ablehnen mit korrigierbaren Werten
- [x] Admin-Tab: KI-Provider umschaltbar (Anthropic / OpenAI / Ollama / Attrappe),
      Bestätigungs-Modus, Benutzer
- [x] GDPR: Datenexport (Auskunft), Löschen/Anonymisieren, Audit-Log-Ansicht
- [x] IMAP-Abruf: automatisch (Polling) + manuell, ungelesene Mails

## Bekannte ARM64-Stolpersteine (siehe auch README)

- `prisma generate`: Backend vorher stoppen (EPERM).
- Prisma-Engine: `engineType = "binary"` im schema.prisma (sonst x64-Crash).
- Befehle aus `backend/` ausführen, nicht aus dem Projekt-Root.
- P1001 (DB nicht erreichbar): Docker läuft nicht.

## KI-Provider (alle ausprogrammiert)

- Anthropic (Claude), OpenAI (GPT) und Ollama (lokal) sind vollständig
  implementiert und im Admin-Tab umschaltbar. Die Attrappe ("dummy") bleibt
  als Test-/Rückfalloption erhalten (greift nur noch, wenn bei einem
  Cloud-Provider der API-Key fehlt).
- **Ollama** läuft lokal (kein Datenabfluss, kein API-Key). Voraussetzung:
  Ollama-Dienst läuft und das Modell ist geladen (`ollama pull llama3.1`).
  Endpoint im Admin-Tab leer lassen für den Standard `http://localhost:11434`.
- **OpenAI** erfordert – wie jeder Cloud-Anbieter – vor Produktivnutzung einen
  eigenen AVV/DPA und EU-Region-Bestätigung (analog zum Anthropic-Hinweis oben).

## Noch nicht implementiert (optional, für später)

- E-Mail-Versand (z. B. Bestätigung an den Absender) ist nicht vorgesehen.
