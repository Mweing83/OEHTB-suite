/*
  Warnings:

  - A unique constraint covering the columns `[kostenstelleId,belegJahr,belegLaufnummer]` on the table `buchung` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `belegJahr` to the `buchung` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "buchung_kostenstelleId_belegLaufnummer_key";

-- AlterTable
ALTER TABLE "buchung" ADD COLUMN     "belegJahr" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "buchung_kostenstelleId_belegJahr_belegLaufnummer_key" ON "buchung"("kostenstelleId", "belegJahr", "belegLaufnummer");
