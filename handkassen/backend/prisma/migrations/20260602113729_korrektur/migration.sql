/*
  Warnings:

  - You are about to drop the column `belegnummer` on the `beleg` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[belegnummer]` on the table `buchung` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `belegnummer` to the `buchung` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "beleg_belegnummer_key";

-- AlterTable
ALTER TABLE "beleg" DROP COLUMN "belegnummer";

-- AlterTable: belegnummer schrittweise hinzufügen, damit bestehende Zeilen Werte bekommen
-- 1) Spalte zunächst NULLBAR anlegen (+ Korrektur-Felder)
ALTER TABLE "buchung" ADD COLUMN     "belegnummer" INTEGER,
ADD COLUMN     "korrekturGrund" TEXT,
ADD COLUMN     "korrekturVonId" INTEGER;

-- 2) Bestehenden Buchungen fortlaufende Belegnummern geben (nach buchungsnummer geordnet)
WITH nummeriert AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "buchungsnummer") AS neue_nr
  FROM "buchung"
)
UPDATE "buchung" b
SET "belegnummer" = n.neue_nr
FROM nummeriert n
WHERE b."id" = n."id";

-- 3) Jetzt, wo alle Zeilen einen Wert haben, NOT NULL erzwingen
ALTER TABLE "buchung" ALTER COLUMN "belegnummer" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "buchung_belegnummer_key" ON "buchung"("belegnummer");

-- AddForeignKey
ALTER TABLE "buchung" ADD CONSTRAINT "buchung_korrekturVonId_fkey" FOREIGN KEY ("korrekturVonId") REFERENCES "buchung"("id") ON DELETE SET NULL ON UPDATE CASCADE;
