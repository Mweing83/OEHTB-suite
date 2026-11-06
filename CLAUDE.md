# ÖHTB-Suite – Arbeitshinweise

Portal (`backend/`, `portal/`) mit den Teilprogrammen `handkassen/`, `stunden/`
und `foerderungen/`. Tool-spezifische Regeln stehen in der jeweiligen
`CLAUDE.md` (z. B. `handkassen/CLAUDE.md`).

## Versionierung

Versionen werden bei jeder Änderung **selbstständig** vergeben, ohne Rückfrage.

- **Schema:** `MAJOR.MINOR.PATCH` (SemVer).
  - **PATCH** für Fehlerbehebungen ohne neue Funktion.
  - **MINOR** für neue Funktionen oder sichtbar geändertes Verhalten.
  - **MAJOR** nur nach Absprache (1.0.0 = Produktivfreigabe).
- **Wo:** in der `package.json` und im Kopf der `package-lock.json`
  (`version` und `packages[""].version`).
  - Suite: Wurzel, `backend/`, `portal/`, immer dieselbe Nummer.
  - Teilprogramm: `<tool>/backend` und `<tool>/frontend`, immer dieselbe Nummer.
- **Welche anheben:** nur die geänderten Teilprogramme. Die **Suite-Version
  steigt bei jeder Änderung** an irgendeinem Teil mit, um die höchste Stufe der
  Teiländerungen. Beispiel: Fix in Handkassen → Handkassen und Suite je PATCH.
- **Wann:** im selben Commit wie die Änderung. Die Commit-Nachricht nennt die
  neue(n) Version(en), z. B. `(Handkassen 0.9.1, Suite 0.9.1)`.
- **Prüfung:** `npm run versions-check` (läuft auch in der CI) prüft, dass die
  zusammengehörigen Nummern übereinstimmen.
- **Anzeige:** In der Kopfzeile jeder Oberfläche (Portal „Suite vX“, Tools
  „<Tool> vX“). Die Frontends lesen die Version beim Build aus ihrer
  `package.json` (`__APP_VERSION__` per Vite `define`).

Stand 06.11.2026: Suite 0.9.0, Handkassen 0.9.0, Stunden 0.1.0, Förderungen 0.1.0.
