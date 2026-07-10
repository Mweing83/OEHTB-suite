-- Suite-Integration (SSO): Login/Passwort liegen im Portal.
-- passwortHash wird optional; suiteUserId verknuepft mit dem zentralen Konto.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwortHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "suiteUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_suiteUserId_key" ON "User"("suiteUserId");
