-- Bereich/Kassenart von Enums zu pflegbaren Stammdaten-Tabellen migrieren.
-- WICHTIG: Diese Migration erhält bestehende Kostenstellen-Daten, indem sie
-- die vorhandenen Enum-Werte in die neuen Tabellen überführt und die
-- Kostenstellen per Fremdschlüssel darauf umhängt, bevor die alten
-- Enum-Spalten entfernt werden.

-- 1) Neue Stammdaten-Tabellen anlegen
CREATE TABLE "bereich" (
    "id" SERIAL NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "bereich_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bereich_bezeichnung_key" ON "bereich"("bezeichnung");

CREATE TABLE "kassenart" (
    "id" SERIAL NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "kassenart_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "kassenart_bezeichnung_key" ON "kassenart"("bezeichnung");

-- 2) Vorhandene Enum-Werte als Stammdaten-Zeilen übernehmen
--    (alle aktuell in Kostenstellen verwendeten Werte; zusätzlich die
--     Standardwerte, damit nichts fehlt). Doppelte werden ignoriert.
INSERT INTO "bereich" ("bezeichnung")
SELECT DISTINCT "bereich"::text FROM "kostenstelle"
ON CONFLICT ("bezeichnung") DO NOTHING;
INSERT INTO "bereich" ("bezeichnung") VALUES ('VBW'), ('GVB'), ('TBW')
ON CONFLICT ("bezeichnung") DO NOTHING;

INSERT INTO "kassenart" ("bezeichnung")
SELECT DISTINCT "kassenart"::text FROM "kostenstelle"
ON CONFLICT ("bezeichnung") DO NOTHING;
INSERT INTO "kassenart" ("bezeichnung") VALUES ('einrichtung'), ('klientenkasse')
ON CONFLICT ("bezeichnung") DO NOTHING;

-- 3) FK-Spalten zunächst NULLbar hinzufügen
ALTER TABLE "kostenstelle" ADD COLUMN "bereichId" INTEGER;
ALTER TABLE "kostenstelle" ADD COLUMN "kassenartId" INTEGER;

-- 4) Bestehende Kostenstellen auf die passenden Stammdaten umhängen
UPDATE "kostenstelle" k
SET "bereichId" = b."id"
FROM "bereich" b
WHERE b."bezeichnung" = k."bereich"::text;

UPDATE "kostenstelle" k
SET "kassenartId" = a."id"
FROM "kassenart" a
WHERE a."bezeichnung" = k."kassenart"::text;

-- 5) Jetzt NOT NULL erzwingen (alle Zeilen haben oben einen Wert bekommen)
ALTER TABLE "kostenstelle" ALTER COLUMN "bereichId" SET NOT NULL;
ALTER TABLE "kostenstelle" ALTER COLUMN "kassenartId" SET NOT NULL;

-- 6) Fremdschlüssel + Indizes
ALTER TABLE "kostenstelle"
    ADD CONSTRAINT "kostenstelle_bereichId_fkey"
    FOREIGN KEY ("bereichId") REFERENCES "bereich"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kostenstelle"
    ADD CONSTRAINT "kostenstelle_kassenartId_fkey"
    FOREIGN KEY ("kassenartId") REFERENCES "kassenart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "kostenstelle_bereichId_idx" ON "kostenstelle"("bereichId");
CREATE INDEX "kostenstelle_kassenartId_idx" ON "kostenstelle"("kassenartId");

-- 7) Alte Enum-Spalten entfernen
ALTER TABLE "kostenstelle" DROP COLUMN "bereich";
ALTER TABLE "kostenstelle" DROP COLUMN "kassenart";

-- 8) Nicht mehr benötigte Enum-Typen entfernen
DROP TYPE "Bereich";
DROP TYPE "Kassenart";
