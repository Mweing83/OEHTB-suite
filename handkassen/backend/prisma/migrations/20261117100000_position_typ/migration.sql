-- Typ (Ausgabe/Einnahme) je Buchungszeile einer Splitbuchung (Key-User-Feedback 2026-11)
ALTER TABLE "buchungsposition" ADD COLUMN "typ" "BuchungsTyp";
