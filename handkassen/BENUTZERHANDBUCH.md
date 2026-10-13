# ÖHTB Handkassen-System – Benutzerhandbuch

Dieses Handbuch richtet sich an alle Personen, die mit dem Handkassen-System
arbeiten: beim Erfassen von Buchungen, beim Monatsabschluss, beim Prüfen und
Freigeben sowie bei der Verwaltung. Es beschreibt die Bedienung der Anwendung –
die technische Einrichtung des Servers steht in der Suite-Anleitung `INSTALL.md`.

> Das System ist eine **revisionssichere** Handkasse: Buchungen werden nie
> gelöscht. Solange der Monat noch nicht freigegeben ist, lassen sie sich
> bearbeiten oder stornieren; jede Änderung wird mit altem und neuem Stand im
> Protokoll festgehalten. Nach der Freigabe sind sie unveränderlich.

---

## Inhalt

1. Erste Schritte (Anmelden, Passwort)
2. Rollen und Berechtigungen
3. Der Aufbau der Oberfläche
4. Buchungen erfassen
5. Belege erfassen (Datei, Foto, Scanner)
6. Buchungen bearbeiten und stornieren
7. Buchungen suchen und filtern
8. Monatsabschluss
9. Berichte und Exporte
10. Kontakt
11. Verwaltung (nur Administration)
12. Begriffe kurz erklärt
13. Häufige Fragen

---

## 1. Erste Schritte

### Anmelden
Die Handkasse ist Teil der **ÖHTB-Suite**. Im Browser die Adresse der Suite
aufrufen, die euch die Administration mitteilt (z. B. `http://<server>`). Es
erscheint die Anmeldemaske des Portals. Dort Benutzername und Passwort eingeben
und auf **Anmelden** klicken. Danach im Portal die Kachel **Handkassen** wählen
(oder direkt `http://<server>/handkassen` aufrufen).

### Passwort
Benutzerkonten und Passwörter werden zentral im Suite-Portal verwaltet, nicht in
der Handkasse. Erstes Passwort und Passwortänderung laufen dort; bei Fragen an
die Administration (Menüpunkt **Kontakt**).

### Automatische Abmeldung
Aus Sicherheitsgründen wird man nach **15 Minuten ohne Aktivität** automatisch
abgemeldet. Eine Minute vorher erscheint ein Hinweis mit der Möglichkeit,
**angemeldet zu bleiben**. Jede Maus- oder Tastatureingabe setzt die Zeit
zurück.

### Abmelden
Oben rechts über **Abmelden**. An gemeinsam genutzten Geräten bitte nach der
Arbeit immer abmelden.

---

## 2. Rollen und Berechtigungen

Was eine Person sehen und tun darf, hängt von ihrer **Rolle** ab. Es gibt vier
Rollen:

- **Erfasser** – erfasst Buchungen und Belege, reicht Monatsabschlüsse ein,
  erstellt Berichte für die eigenen (zugewiesenen) Kostenstellen.
- **Leitung** – wie Erfasser, kann zusätzlich eingereichte Abschlüsse **prüfen**.
- **Finanzen** – kann zusätzlich geprüfte Abschlüsse **freigeben** und die
  kassenübergreifenden Exporte (BMD, CSV über alle Kassen) erstellen.
- **Admin (Verwaltung)** – uneingeschränkter Zugriff inklusive des Menüpunkts
  **Verwaltung** (Stammdaten, Benutzer, Einstellungen, Datensicherung).

Welche Kostenstellen jemand sieht, legt die Administration über die
Benutzer-Zuweisung fest (siehe Abschnitt 11). Leitung, Finanzen und Admin
sehen je nach Einrichtung mehrere bzw. alle Kostenstellen.

---

## 3. Der Aufbau der Oberfläche

Am oberen Rand befindet sich die Navigationsleiste mit den Menüpunkten:

- **Buchungen** – das tägliche Erfassen (Startseite nach der Anmeldung).
- **Abschlüsse** – Monatsabschluss einreichen, prüfen, freigeben.
- **Berichte** – Kassabericht, Detailbericht, Zählliste, CSV-Export.
- **Verwaltung** – nur für die Rolle Admin sichtbar.
- **Kontakt** – Ansprechpartner bei Fragen.

Rechts oben stehen der eigene Name samt Rolle sowie der Link **Abmelden**.

---

## 4. Buchungen erfassen

Der Menüpunkt **Buchungen** ist die zentrale Arbeitsfläche.

### Kostenstelle wählen
Ganz oben wird die **Kostenstelle** ausgewählt. Rechts daneben wird laufend der
aktuelle **Kassenstand** dieser Kostenstelle angezeigt.

### Eine neue Buchung anlegen
Im Block **Neue Buchung** werden folgende Angaben gemacht:

- **Belegdatum** – im Format TT.MM.JJJJ. Über das Kalendersymbol lässt sich ein
  Kalender öffnen. Die Eingabe ist immer deutsch, unabhängig von den
  Windows-Einstellungen.
- **Typ** – **Ausgang** (Geld verlässt die Kasse) oder **Eingang** (Geld kommt
  herein). Standard ist Ausgang.
- **Beschreibung** (optional) – kurzer Text, was gekauft/eingenommen wurde.
- **Positionen** – mindestens eine Zeile mit **Betrag**, **Steuersatz** und
  **Konto**:
  - Der **Betrag** wird in Euro mit Komma eingegeben (z. B. `12,50`).
  - Der **Steuersatz** wird je Position gewählt (z. B. 20 %, 10 %, 0 %).
  - Das **Konto** ordnet die Position dem Kontenplan zu.
- **Beleg** – optional ein Foto/Scan/PDF (siehe Abschnitt 5).

Rechts wird laufend die **Summe** aller Positionen angezeigt.

### Mehrere Steuersätze in einer Buchung (Split)
Wenn ein einzelner Beleg Positionen mit **unterschiedlichen Steuersätzen**
enthält (z. B. Lebensmittel mit 10 % und Non-Food mit 20 %), klickt man auf
**+ Position** und trägt jede Position mit ihrem eigenen Betrag, Steuersatz und
Konto ein. Die Summe ergibt den Gesamtbetrag des Belegs. Eine überflüssige
Position lässt sich mit dem **✕** wieder entfernen.

### Speichern
Mit **Buchung speichern** wird die Buchung festgeschrieben. Anschließend
erscheint die zugeteilte **Belegnummer**. Diese Belegnummer bitte gut sichtbar
**auf den Papierbeleg schreiben** – so lässt sich der physische Beleg jederzeit
der digitalen Buchung zuordnen.

> Hinweis: Geldbeträge werden im System immer exakt in Cent geführt – es
> entstehen keine Rundungsfehler.

---

## 5. Belege erfassen (Datei, Foto, Scanner)

Im Bereich **Beleg** einer Buchung gibt es zwei Wege:

- **Datei wählen** – eine vorhandene Datei (JPG, PNG oder PDF) vom Gerät
  anhängen.
- **📷 Foto aufnehmen** – direkt mit der Kamera des Geräts fotografieren.

### Der Beleg-Scanner
Bei Bildern (Foto oder gewählte Bilddatei) öffnet sich anschließend der
**Beleg-Scanner**: Er erkennt die Belegkanten, die Ecken lassen sich bei Bedarf
nachziehen, und das Bild wird sauber zugeschnitten. PDFs werden direkt
angehängt (ohne Scanner).

### Kamera bedienen
Nach **Foto aufnehmen** zeigt sich das Live-Bild. Mit **Auslösen** wird das Foto
gemacht. Sind mehrere Kameras vorhanden (z. B. Vorder- und Rückkamera), gibt es
einen Knopf **🔄 Kamera wechseln**. Lässt sich keine Live-Kamera öffnen, wird
ersatzweise die Kamera-App des Geräts verwendet.

### Beleg prüfen und ersetzen
Nach dem Erfassen wird der Beleg als Vorschau angezeigt. Über **Entfernen** wird
er verworfen, über **Neu aufnehmen** kann man ihn ersetzen. Der Beleg wird erst
mit der Buchung gespeichert.

> Ob ein Beleg **verpflichtend** ist und in welcher Qualität Fotos gespeichert
> werden, legt die Administration unter Verwaltung → Einstellungen → Belege fest.

---

## 6. Buchungen bearbeiten und stornieren

Weil das System revisionssicher ist, werden Buchungen **nicht gelöscht**. Es
gibt stattdessen zwei Wege, die in der Buchungsliste rechts je Zeile angeboten
werden (solange der Monat noch nicht freigegeben ist):

### Bearbeiten
**Bearbeiten** übernimmt die Werte der Buchung ins Formular (oben); die Zeile
wird in der Liste gelb hervorgehoben. Dort lassen sich Betrag, Konto, Steuersatz,
Datum und Beschreibung anpassen und bei Bedarf ein neuer Beleg anhängen (ohne
neuen Beleg bleibt der vorhandene). Mit **Änderungen speichern** wird die Buchung
**direkt geändert**: Buchungs- und Belegnummer bleiben gleich, der Kassenstand
wird angepasst, und alter wie neuer Stand landen im Protokoll. Das Belegjahr kann
nicht gewechselt werden, weil die Belegnummer daran hängt; in dem Fall die
Buchung stornieren und neu erfassen. **Abbrechen** verlässt den Bearbeiten-Modus
ohne Änderung.

Ältere Buchungen können noch den Hinweis „Korrektur von Nr. …" tragen: Das war
der frühere Weg (Original storniert, neue Buchung angelegt) und bleibt so
sichtbar.

### Stornieren
**Storno** macht eine Buchung ungültig, ohne sie zu ersetzen (nach einer
Sicherheitsabfrage). Stornierte Buchungen bleiben durchgestrichen in der Liste
sichtbar und fließen nicht mehr in den Kassenstand ein.

### Gesperrte Buchungen
Buchungen aus einem bereits **freigegebenen** Monat sind **gesperrt** und tragen
den Vermerk „gesperrt". Sie können weder bearbeitet noch storniert werden.

---

## 7. Buchungen suchen und filtern

Über der Buchungsliste befindet sich eine Filterleiste. Alle Filter wirken
sofort und lassen sich beliebig kombinieren:

- **Suche** – durchsucht Beschreibung, Kontonummer sowie Buchungs- und
  Belegnummer.
- **Von / Bis** – schränkt auf einen Datumsbereich ein.
- **Konto** – zeigt nur Buchungen mit einem bestimmten Konto.
- **Typ** – Eingang oder Ausgang.
- **Stornierte anzeigen** – blendet auch stornierte Buchungen ein.

Mit **Filter zurücksetzen** werden alle Einschränkungen aufgehoben. Rechts wird
angezeigt, wie viele der vorhandenen Buchungen gerade sichtbar sind. Über das
Bild-Symbol in der Spalte **Beleg** öffnet sich die Belegvorschau seitlich.

---

## 8. Monatsabschluss

Der Menüpunkt **Abschlüsse** dient dazu, einen Kalendermonat einer Kostenstelle
abzuschließen. Der Ablauf hat mehrere Stufen, die dem Vier-Augen-Prinzip folgen.

### Abschluss einreichen (Erfasser/Leitung)
Links unter **Monatsabschluss einreichen**:

1. **Kostenstelle**, **Jahr** und **Monat** wählen.
2. Den **gezählten Kassenstand (Zählliste)** eingeben – also den real in der
   Kasse gezählten Bargeldbestand (z. B. `0,00`).
3. Auf **Abschluss einreichen** klicken.

Das System vergleicht den gezählten Stand mit dem rechnerischen Soll-Stand und
meldet entweder „Soll/Ist stimmt überein" oder weist eine **Differenz** aus.

### Status eines Abschlusses
Rechts werden alle Abschlüsse mit ihrem Status gelistet:

- **offen** – noch nicht eingereicht.
- **eingereicht** – wartet auf die Prüfung.
- **geprüft** – von der Leitung geprüft, wartet auf Freigabe.
- **freigegeben** – endgültig freigegeben; die Buchungen des Monats sind nun
  gesperrt.

### Prüfen (Leitung) und Freigeben (Finanzen)
- Die **Leitung** sieht bei eingereichten Abschlüssen die Aktion **prüfen**.
- **Finanzen** sieht bei geprüften Abschlüssen die Aktion **freigeben**.

Mit der **Freigabe** wird der Monat abgeschlossen: Alle Buchungen dieses
Zeitraums werden gesperrt und sind damit unveränderlich.

---

## 9. Berichte und Exporte

Der Menüpunkt **Berichte** stellt Auswertungen bereit. Zuerst werden
Kostenstelle und Zeitraum (Monat oder ein Von–Bis-Zeitraum) gewählt.

### PDF-Berichte
- **Kassabericht** – die monatliche Kassenübersicht mit Anfangs- und
  Endbestand.
- **Detailbericht** – alle Buchungen des Zeitraums mit Konten, MwSt und Beträgen.
- **Zählliste** – Vorlage zum Auszählen des Bargelds.

Diese öffnen sich als PDF in einem neuen Browser-Tab und können dort gespeichert
oder gedruckt werden.

### CSV (Excel)
- **CSV (Excel)** – lädt die Buchungen des gewählten Zeitraums als Tabelle
  herunter. Die Datei ist auf Excel im deutschsprachigen Raum abgestimmt
  (Semikolon-getrennt, Komma als Dezimaltrennzeichen, Umlaute korrekt). Die
  Spalte „Betrag" ist vorzeichenbehaftet (Ausgänge negativ) und summiert sich
  zum Saldo des Zeitraums.

### Export über alle Kassen (nur Finanzen/Admin)
Im unteren Abschnitt – nur für Finanzen und Admin sichtbar – gibt es den
monatsweisen Export **über alle Kostenstellen**:

- **BMD-Datei** – Buchungssatz-Datei (.txt) für den Import in die
  Buchhaltungssoftware BMD.
- **CSV (alle Kassen)** – dieselben Daten als Excel-Tabelle, zusätzlich mit
  Kostenstelle und Bereich je Zeile.

---

## 10. Kontakt

Der Menüpunkt **Kontakt** zeigt die von der Administration hinterlegten
Ansprechpartner (Name, E-Mail, Telefon, optional ein Hinweis). E-Mail und
Telefon sind anklickbar. Diese Seite ist für alle angemeldeten Nutzer sichtbar
und dient als erste Anlaufstelle bei Fragen oder Problemen.

---

## 11. Verwaltung (nur Administration)

Der Menüpunkt **Verwaltung** ist nur für die Rolle **Admin** sichtbar. Er ist in
vier Oberbereiche mit Unterreitern gegliedert.

### Stammdaten
- **Kostenstellen** – die einzelnen Kassen anlegen/bearbeiten (Nummer,
  Bezeichnung, Bereich, Kassenart, Gegenkonto, Anfangssaldo). Statt Löschen
  werden nicht mehr benötigte Einträge **deaktiviert**.
- **Bereiche** – die organisatorischen Bereiche, denen Kostenstellen zugeordnet
  sind.
- **Kassenarten** – die Arten von Kassen.
- **Kontenplan** – die Konten, auf die gebucht wird (Nummer und Bezeichnung).
- **Steuersätze** – die wählbaren MwSt-Sätze.

### Benutzer
Benutzerkonten, Passwörter und die Rolle je Tool werden zentral im Suite-Portal
(Verwaltung) angelegt; beim ersten Anmelden erscheint der Benutzer automatisch
hier. In der Handkasse wird je Benutzer die **Zuweisung von Kostenstellen**
gepflegt. Konten werden **deaktiviert** statt gelöscht; ein deaktivierter Zugang
kann sich nicht mehr anmelden. Es gibt Filter nach Rolle und Status.

### Einstellungen
- **Belege** – ob ein Beleg verpflichtend ist und in welcher Auflösung Belegfotos
  gespeichert werden.
- **Kassensperre** – Fristen und manuelle Monatssperren.
- **Kontakt** – die Kontaktdaten, die im Menüpunkt „Kontakt" für alle erscheinen.

### System
- **Datensicherung** – Übersicht der lokalen Sicherungen mit der Möglichkeit,
  eine Sicherung zu **prüfen**; Zeitplan und Aufbewahrung werden hier verwaltet.
- **Audit-Log** – das Protokoll aller sicherheitsrelevanten Vorgänge.

> Hinweise zum Anlegen echter Benutzer und zum Deaktivieren der Demo-Zugänge bei
> der Inbetriebnahme stehen in der Suite-Anleitung `INSTALL.md`.

---

## 12. Begriffe kurz erklärt

- **Kostenstelle** – eine einzelne Handkasse (z. B. einer Wohngemeinschaft oder
  eines Bereichs).
- **Buchung** – ein einzelner Geldvorgang (Eingang oder Ausgang).
- **Position** – ein Teilbetrag einer Buchung mit eigenem Steuersatz und Konto.
  Eine Buchung kann aus mehreren Positionen bestehen (Split).
- **Beleg / Belegnummer** – der Nachweis zur Buchung; die Belegnummer verbindet
  Papierbeleg und digitale Buchung.
- **Storno** – das Ungültigmachen einer Buchung (sie bleibt sichtbar).
- **Bearbeiten** – eine Buchung in einem offenen Monat direkt ändern; Nummern
  bleiben, alter und neuer Stand stehen im Protokoll.
- **Zählliste** – der real gezählte Bargeldbestand beim Monatsabschluss.
- **Soll / Ist** – rechnerischer Stand (Soll) gegenüber gezähltem Stand (Ist).
- **Revisionssicher** – Vorgänge werden nicht gelöscht; Änderungen und Stornos
  sind im Protokoll nachvollziehbar, freigegebene Monate sind unveränderlich.

---

## 13. Häufige Fragen

**Ich kann mich nicht anmelden.**
Die Anmeldung läuft über das Suite-Portal. Benutzername/Passwort prüfen; bleibt
es bei einer Fehlermeldung oder fehlt die Kachel „Handkassen", an die
Administration wenden (Menüpunkt Kontakt).

**Ich habe mich vertippt – die Buchung ist schon gespeichert.**
Die Buchung **bearbeiten** (Werte werden übernommen und direkt geändert) oder
**stornieren**. Löschen ist bewusst nicht möglich.

**Ich finde die Aktionen „Bearbeiten/Storno" nicht.**
Die Buchung gehört vermutlich zu einem bereits **freigegebenen** Monat und ist
**gesperrt**. Gesperrte Buchungen sind unveränderlich.

**Ein Beleg hatte mehrere Steuersätze – wie buche ich das?**
Über **+ Position** mehrere Zeilen anlegen, jede mit eigenem Betrag, Steuersatz
und Konto. Die Summe ergibt den Gesamtbetrag.

**Beim Abschluss wird eine Differenz angezeigt.**
Der gezählte Kassenstand weicht vom rechnerischen Soll ab. Bargeld erneut zählen
und Buchungen prüfen. Der Abschluss kann mit Differenz eingereicht werden; die
Klärung erfolgt im Prüf-/Freigabeprozess.

**Ich wurde plötzlich abgemeldet.**
Nach 15 Minuten ohne Aktivität meldet das System automatisch ab. Einfach erneut
anmelden; eine Minute vorher kann man „angemeldet bleiben" wählen.

**Wo bekomme ich Hilfe?**
Über den Menüpunkt **Kontakt** sind die zuständigen Ansprechpartner hinterlegt.
