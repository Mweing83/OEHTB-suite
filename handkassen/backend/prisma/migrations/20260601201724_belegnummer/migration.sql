/*
  Warnings:

  - A unique constraint covering the columns `[belegnummer]` on the table `beleg` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `belegnummer` to the `beleg` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "beleg" ADD COLUMN     "belegnummer" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "beleg_belegnummer_key" ON "beleg"("belegnummer");
