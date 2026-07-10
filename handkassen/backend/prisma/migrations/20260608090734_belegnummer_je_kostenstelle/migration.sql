/*
  Warnings:

  - A unique constraint covering the columns `[kostenstelleId,belegLaufnummer]` on the table `buchung` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[nummer]` on the table `kostenstelle` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `belegLaufnummer` to the `buchung` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nummer` to the `kostenstelle` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "buchung_belegnummer_key";

-- AlterTable
ALTER TABLE "buchung" ADD COLUMN     "belegLaufnummer" INTEGER NOT NULL,
ALTER COLUMN "belegnummer" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "kostenstelle" ADD COLUMN     "nummer" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "buchung_kostenstelleId_belegLaufnummer_key" ON "buchung"("kostenstelleId", "belegLaufnummer");

-- CreateIndex
CREATE UNIQUE INDEX "kostenstelle_nummer_key" ON "kostenstelle"("nummer");
