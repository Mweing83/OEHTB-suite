-- AlterEnum
ALTER TYPE "AnfrageStatus" ADD VALUE 'VERARBEITET';

-- AlterEnum
ALTER TYPE "Rolle" ADD VALUE 'PERSONALVERRECHNUNG';

-- AlterTable
ALTER TABLE "Aenderungsanfrage" ADD COLUMN     "verarbeitetAm" TIMESTAMP(3),
ADD COLUMN     "verarbeitetVon" TEXT,
ADD COLUMN     "verarbeitungNotiz" TEXT;
