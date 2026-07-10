-- AlterTable
ALTER TABLE "tool" ADD COLUMN "provisionUrl" TEXT;

-- CreateTable
CREATE TABLE "provision_outbox" (
    "id" TEXT NOT NULL,
    "toolSlug" TEXT NOT NULL,
    "suiteUserId" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "versuche" INTEGER NOT NULL DEFAULT 0,
    "letzterFehler" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erledigtAm" TIMESTAMP(3),

    CONSTRAINT "provision_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provision_outbox_status_erstelltAm_idx" ON "provision_outbox"("status", "erstelltAm");
