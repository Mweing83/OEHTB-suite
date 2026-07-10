-- AlterTable
ALTER TABLE "benutzer" ADD COLUMN     "passwortSetzen" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "passwortHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "kostenstelle" ADD COLUMN     "anfangssaldoCent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "steuersatz" (
    "id" SERIAL NOT NULL,
    "prozent" INTEGER NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "steuersatz_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "steuersatz_prozent_key" ON "steuersatz"("prozent");
