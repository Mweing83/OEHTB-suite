-- Suite-Integration (SSO): Login liegt im Portal.
-- suiteUserId verknuepft die lokale Benutzer-Zeile mit dem zentralen Konto.

-- AlterTable
ALTER TABLE "benutzer" ADD COLUMN "suiteUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "benutzer_suiteUserId_key" ON "benutzer"("suiteUserId");
