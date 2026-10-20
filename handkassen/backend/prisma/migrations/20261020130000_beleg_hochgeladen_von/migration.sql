-- Beleg merkt sich den Hochladenden (nur dieser darf ihn einer Buchung zuordnen).
ALTER TABLE "beleg" ADD COLUMN "hochgeladenVonId" INTEGER;
