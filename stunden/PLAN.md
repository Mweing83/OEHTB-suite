# Stunden-Tool ÖHTB – Projektplan

Web-Tool zur Verwaltung von Wochenstunden und Beschäftigungsausmaß (%) der
Mitarbeiter. Änderungsanfragen kommen per E-Mail (IMAP oder Copy & Paste),
werden KI-gestützt ausgelesen, optional von einem Menschen bestätigt und
revisionssicher historisiert. Dashboard zeigt den aktuellen Stand aller Personen.

Sprache der Anwendung: **Deutsch**.
Projektpfad: `C:\myProjects\OEHTB\stunden`

---

## 1. Technischer Stack (analog Handkassen-System)

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Datenbank:** PostgreSQL + Prisma ORM
- **Auth:** bcrypt + JWT (Session-Cookie, Inaktivitäts-Timeout)
- **Infrastruktur:** Docker Compose
- **Entwicklungs-OS:** Windows ARM64 (Snapdragon/Copilot+ PC)

### Bekannte ARM64-/Umgebungs-Stolpersteine (aus Handkassen übernommen)
- `prisma generate`: Backend vorher stoppen (EPERM-Fehler auf ARM64).
- P1001 (DB nicht erreichbar): meist läuft Docker nicht.
- "Could not find Prisma Schema": Befehle aus `backend/` ausführen, nicht aus Projekt-Root.

---

## 2. Datenmodell (Prisma)

### Mitarbeiter
Stammdaten der betroffenen Personen.
- `id`, `vorname`, `nachname`, `personalnummer` (eindeutig), `email` (optional)
- `bereich` (z. B. VBW/GVB/TBW – analog Handkassen)
- `aktiv` (boolean, für Austritte ohne Löschung)
- `erstelltAm`

### Beschaeftigung (zeitliche Historie – NIE überschreiben!)
Jede Stunden-/Ausmaß-Änderung ist ein neuer Datensatz mit Gültigkeitsdatum.
- `id`, `mitarbeiterId`
- `wochenstunden` (Decimal)
- `ausmassProzent` (Decimal)
- `gueltigAb` (Date)
- `erfasstAm`, `erfasstVon` (User-Referenz)
- `quelle` (MAIL_IMAP | MAIL_PASTE | MANUELL)
- `aenderungsanfrageId` (optional – Verweis auf die auslösende Anfrage)
- `notiz` (optional)

**Aktueller Stand** = jüngster Beschaeftigung-Eintrag mit `gueltigAb <= heute`.
Zukünftige Änderungen liegen bereits in der DB, werden aber erst ab Datum aktiv.

### Aenderungsanfrage (Mail-Workflow)
- `id`, `rohtext`, `eingegangenAm`
- `quelle` (IMAP | PASTE)
- `absenderEmail` (optional)
- `status` (NEU | GEPARSED | ZUR_BESTAETIGUNG | BESTAETIGT | ABGELEHNT | FEHLER)
- `parseErgebnis` (JSON – strukturiertes KI-Ergebnis)
- `konfidenz` (Float, 0..1 – von der KI gemeldet)
- `pseudonymMapping` (JSON – lokal, NIE an KI gesendet)
- `bearbeitetVon`, `bearbeitetAm`, `ablehnungsgrund` (optional)

### User (Tool-Benutzer)
- `id`, `email`, `passwortHash`, `rolle` (ADMIN | SACHBEARBEITER | LESER)
- `aktiv`, `letzterLogin`

### AuditLog (GDPR-Nachweis)
- `id`, `userId`, `aktion`, `betroffenerMitarbeiterId` (optional)
- `zeitpunkt`, `details` (JSON)
- KEINE Klarnamen in den Logtexten – nur IDs.

### Einstellung (Admin-Konfiguration, Key-Value)
- `id`, `schluessel`, `wert` (JSON)
- Speichert u. a. LLM-Provider, Modell, Bestätigungs-Modus, Konfidenz-Schwelle.

---

## 3. Mail-Workflow (Schritt für Schritt)

1. **Eingang**
   - IMAP-Abruf von österreichischem Dienstleister (Polling-Intervall konfigurierbar), ODER
   - Copy & Paste in ein Textfeld im Tool.
   - → erzeugt `Aenderungsanfrage` mit Status NEU.
2. **Pseudonymisierung (LOKAL)**
   - Bekannte Mitarbeiternamen im Rohtext werden durch Platzhalter ersetzt
     (z. B. „Frau Mayer" → „PERSON_1").
   - Mapping wird lokal in `pseudonymMapping` gespeichert, verlässt das System nie.
3. **KI-Parsing**
   - Pseudonymisierter Text geht an den im Admin-Tab gewählten Provider.
   - Erwartete strukturierte Antwort (JSON):
     `{ personPlatzhalter, altStunden?, neuStunden, ausmassProzent?, gueltigAb, konfidenz }`
4. **Re-Identifikation (LOKAL)**
   - Platzhalter werden über das Mapping zurück auf echte Mitarbeiter aufgelöst.
   - Status → GEPARSED.
5. **Bestätigung (konfigurierbar im Admin-Tab)**
   - Modus A: immer manuell bestätigen (Default, sicherste Variante).
   - Modus B: vollautomatisch speichern.
   - Modus C: automatisch ab Konfidenz-Schwelle, sonst manuell.
   - Bei manuell: Status ZUR_BESTAETIGUNG, erscheint in der Bearbeitungs-Queue.
6. **Speicherung**
   - Neuer `Beschaeftigung`-Eintrag wird angelegt.
   - Anfrage → BESTAETIGT (oder ABGELEHNT mit Grund).
   - AuditLog-Eintrag.

---

## 4. LLM-Provider-Abstraktion (Admin-konfigurierbar)

Einheitliches Interface, mehrere Implementierungen, zur Laufzeit umschaltbar.

```
interface LLMProvider {
  parseAenderung(pseudonymisierterText: string): Promise<ParseErgebnis>
}
```

Implementierungen:
- **AnthropicProvider** (Cloud – EU-Region + AVV erforderlich)
- **OpenAIProvider** (Cloud – EU-Region + AVV erforderlich)
- **OllamaProvider** (lokal – kein Datenabfluss, Endpoint-URL konfigurierbar)

Im Admin-Tab konfigurierbar:
- aktiver Provider, Modellname, API-Key (verschlüsselt gespeichert),
  Endpoint-URL (für Ollama), Bestätigungs-Modus, Konfidenz-Schwelle.

---

## 5. Rollen & Rechte

- **ADMIN:** Konfiguration, Modellwahl, Benutzerverwaltung, IMAP-Einstellungen,
  alle Daten, AuditLog einsehen.
- **SACHBEARBEITER (HR):** Anfragen-Queue bearbeiten/bestätigen, Stammdaten
  pflegen, manuelle Änderungen erfassen, Dashboard + History.
- **LESER:** nur Dashboard und History ansehen, keine Änderungen.

Kein Mitarbeiter-Self-Service (bewusst weggelassen, hält es einfach).

---

## 6. Frontend-Seiten

- **Login**
- **Dashboard:** Tabelle aller aktiven Mitarbeiter mit aktuellen Wochenstunden +
  Ausmaß %, Filter nach Bereich, Suche, Hinweis auf anstehende künftige Änderungen.
- **Anfragen-Queue:** offene Änderungsanfragen, Paste-Feld, Detailansicht mit
  KI-Vorschlag, Bestätigen/Ablehnen/Korrigieren.
- **Mitarbeiter-Detail:** Stammdaten + vollständige Beschäftigungs-History
  (Zeitstrahl), Export, Löschen (GDPR).
- **Mitarbeiterverwaltung:** Anlegen/Bearbeiten von Stammdaten.
- **Admin-Tab:** LLM-Provider & Modell, Bestätigungs-Modus, Konfidenz-Schwelle,
  IMAP-Konfiguration, Benutzerverwaltung, AuditLog.

---

## 7. GDPR-Bausteine

- Pseudonymisierung vor jedem KI-Call (Klarnamen verlassen das System nicht,
  außer bei Cloud-Providern explizit der pseudonymisierte Text – Mapping bleibt lokal).
- Vollständiges AuditLog (wer hat wann was gesehen/geändert), ohne Klarnamen.
- Auskunft & Löschung: Mitarbeiter-Export (JSON/PDF) + Löschfunktion mit
  Hinweis auf gesetzliche Aufbewahrungsfristen.
- Rollenbasierter Zugriff (RBAC).
- Keine Personennamen in Logs oder URLs.
- API-Keys verschlüsselt at rest.
- Datensparsamkeit: nur Stunden + Ausmaß + Stammdaten, keine Lohn-/Gehaltsdaten.

**Organisatorisch (bei ÖHTB, nicht im Code):**
- AVV/DPA mit Cloud-LLM-Anbieter (falls Cloud genutzt) in EU-Region.
- Eintrag im Verarbeitungsverzeichnis.
- Lösch-/Aufbewahrungskonzept abstimmen.

---

## 8. Aufbaureihenfolge (Bauphasen)

1. **Gerüst:** Ordnerstruktur, Docker Compose, Prisma-Schema, erste Migration, Auth.
2. **Stammdaten + Dashboard:** Mitarbeiter anlegen, aktueller Stand, History-Logik.
3. **Manuelle Erfassung:** Beschäftigungsänderung von Hand eintragen (Test der History).
4. **Mail-Workflow Teil 1:** Paste-Feld, Pseudonymisierung, LLM-Abstraktion, Parsing, Queue.
5. **Mail-Workflow Teil 2:** IMAP-Anbindung + Polling.
6. **Admin-Tab:** Provider-/Modellwahl, Bestätigungs-Modus, Konfidenz-Schwelle, IMAP-Config.
7. **GDPR-Funktionen:** Export, Löschen, AuditLog-Ansicht.
8. **Feinschliff:** Validierung, Fehlerbehandlung, CHECKLISTE.md für Produktion.

---

## 9. Offene organisatorische Punkte (vor Produktivgang zu klären)
- Woher kommen die initialen Stammdaten? (Import aus alter Excel?)
- Welcher Cloud-LLM-Anbieter, falls Cloud – und ist der AVV unterschrieben?
- IMAP-Zugangsdaten und Polling-Intervall.
- Aufbewahrungsfristen für Beschäftigungshistorie (arbeitsrechtlich).
