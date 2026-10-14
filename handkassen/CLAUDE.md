# Projekt: ÖHTB Handkassen-System

Digitales System zur revisionssicheren Erfassung, Kontrolle und Verwaltung aller
Handkassen-Buchungen der ÖHTB Wohnen GmbH. Bezug: Lastenheft "Digitales
Handkassen-System", Version 1.0.

## Leitprinzipien (nicht verhandelbar)

- **Nur kostenfreie / Open-Source-Bibliotheken.** Keine kostenpflichtigen Dienste.
- **Alles lokal lauffähig.** Keine externen Cloud-Dienste. Die fertige Anwendung
  läuft vollständig auf einem ÖHTB-Server, offline.
- **Maximal schlank.** Wenige, bewährte Bausteine. Keine unnötigen Abstraktionen,
  keine spekulativen Features. Im Zweifel die einfachere Lösung.
- **Wartbar.** Verbreitete Standardtechnologien, klare Benennung auf Deutsch/Englisch
  gemischt wie im Code üblich (Domänenbegriffe deutsch: buchung, kostenstelle, konto).

## Tech-Stack

- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend: Node.js + Express + TypeScript
- Datenbank: PostgreSQL, Zugriff über Prisma ORM
- Auth: Suite-SSO – Anmeldung und Passwörter liegen zentral im Suite-Portal; das Tool
  prüft das gemeinsame JWT-Cookie (lib/suiteAuth.ts) und provisioniert Benutzer beim Login
- PDF: serverseitig (pdfkit)
- Betrieb: Docker + Docker Compose, ausschließlich über die OEHTB-Suite (Suite-Root)

### Betrieb / Start

- **Entwicklung:** `docker compose up -d` in diesem Ordner startet NUR die
  Entwicklungs-Datenbank (Container `handkassen-dev-db`, Daten in `postgres-data/`).
  Backend per `npm run dev` im backend-Ordner, Konfiguration aus `backend/.env`
  (Vorlage `backend/.env.example`). Login läuft auch lokal über das Suite-Portal.
- **Produktion:** NUR über die Suite im übergeordneten Ordner
  (`docker compose --profile produktion up -d --build` bzw. `SERVER - *.bat` dort).
  Es gibt keinen eigenständigen Handkassen-Betrieb mehr; die hiesige
  `docker-compose.yml` enthält bewusst keinen App-/Backup-Dienst und kein
  benanntes Volume, damit sie die Produktivdaten (`handkassen_db_data`) nie
  berühren kann.

## Domänenregeln (zentral, immer beachten)

- **Geldbeträge immer als Ganzzahl in Cent speichern und rechnen.** Niemals Float.
- Eine Rechnung = eine Buchung. Keine Sammelrechnungen.
- Eine Buchung kann mehrere Positionen haben (Split): jede Position hat
  Betrag (Cent), Steuersatz (0/10/20) und ein Konto. Summe der Positionen muss
  exakt dem Buchungsbetrag entsprechen.
- Erlaubte Steuersätze kommen aus der Tabelle "steuersatz" (durch Admin pflegbar).
  buchungValidieren erhält die aktiven Sätze als Parameter. Standard/Fallback: 0, 10, 20.
  Ausländische/handgeschriebene Belege: 0.
- Trinkgeld -> Konto 76900 "Spenden & Trinkgelder" (0 %).
- Pfand wird auf dem Konto des Belegs mitgebucht; ergibt sich ein Minus ->
  Konto 99900 "Unklare Buchungsfälle".
- Buchungsnummer wird automatisch fortlaufend vergeben.
- Belegnummer wird automatisch fortlaufend vergeben und hängt an der Buchung
  (Spalte buchung.belegnummer); sie wird IMMER vergeben, auch ohne hinterlegtes Foto.
- Buchungsdatum = tagesaktuell; Belegdatum frei wählbar.
- Ersteller wird automatisch und unveränderbar hinterlegt.
- Erfasser:innen sind **je Kostenstelle separat freigeschaltet** (Tabelle
  benutzer_kostenstelle). Nutzer sehen nur Daten ihrer zugewiesenen Kostenstellen.
- Monatsabschluss-Status: offen -> eingereicht -> geprüft -> freigegeben.
  Solange die Periode nicht freigegeben ist, werden Buchungen direkt bearbeitet
  (PUT /buchungen/:id; alte/neue Werte im audit_log, Nummern bleiben). Nach
  Freigabe ist die Periode gesperrt (weder Bearbeiten noch Storno).

## Revisionssicherheit

- Jede datenändernde Aktion schreibt einen Eintrag ins `audit_log`
  (wer, wann, Aktion, betroffener Datensatz, alte/neue Werte).
- Das audit_log wird nur angehängt, nie verändert oder gelöscht.

## Rollen

- erfasser: bucht, lädt Belege, macht Tages-/Monatsabschluss (nur eigene Kostenstellen)
- leitung: prüft und gibt Abschlüsse der zugeordneten Standorte frei
- finanzen: zentrale Endkontrolle, BMD-Export, organisationsweite Sicht
- admin: verwaltet Benutzer, Kostenstellen, Stammdaten

## Tests

- Buchungslogik (Split-Summe, Steuersätze, Saldoberechnung) mit Unit-Tests absichern.
- Tests vor jedem Commit ausführen lassen.

## Arbeitsweise

- Größere Änderungen vorher als kurzen Plan zeigen, dann umsetzen.
- Keine echten Personen-/Buchungsdaten in Beispielen; Seed-Daten sind fiktiv.
