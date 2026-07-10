-- CreateEnum
CREATE TYPE "Quelle" AS ENUM ('MANUELL', 'MAIL_IMAP', 'MAIL_PASTE');

-- CreateEnum
CREATE TYPE "AnfrageQuelle" AS ENUM ('IMAP', 'PASTE');

-- CreateEnum
CREATE TYPE "AnfrageStatus" AS ENUM ('NEU', 'GEPARSED', 'ZUR_BESTAETIGUNG', 'BESTAETIGT', 'ABGELEHNT', 'FEHLER');

-- CreateEnum
CREATE TYPE "Rolle" AS ENUM ('ADMIN', 'SACHBEARBEITER', 'LESER');

-- CreateTable
CREATE TABLE "Mitarbeiter" (
    "id" TEXT NOT NULL,
    "vorname" TEXT NOT NULL,
    "nachname" TEXT NOT NULL,
    "personalnummer" TEXT NOT NULL,
    "email" TEXT,
    "bereich" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mitarbeiter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beschaeftigung" (
    "id" TEXT NOT NULL,
    "mitarbeiterId" TEXT NOT NULL,
    "wochenstunden" DECIMAL(5,2) NOT NULL,
    "ausmassProzent" DECIMAL(5,2) NOT NULL,
    "gueltigAb" DATE NOT NULL,
    "erfasstAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erfasstVon" TEXT,
    "quelle" "Quelle" NOT NULL DEFAULT 'MANUELL',
    "aenderungsanfrageId" TEXT,
    "notiz" TEXT,

    CONSTRAINT "Beschaeftigung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aenderungsanfrage" (
    "id" TEXT NOT NULL,
    "rohtext" TEXT NOT NULL,
    "eingegangenAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quelle" "AnfrageQuelle" NOT NULL,
    "absenderEmail" TEXT,
    "status" "AnfrageStatus" NOT NULL DEFAULT 'NEU',
    "parseErgebnis" JSONB,
    "konfidenz" DOUBLE PRECISION,
    "pseudonymMapping" JSONB,
    "bearbeitetVon" TEXT,
    "bearbeitetAm" TIMESTAMP(3),
    "ablehnungsgrund" TEXT,

    CONSTRAINT "Aenderungsanfrage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwortHash" TEXT NOT NULL,
    "name" TEXT,
    "rolle" "Rolle" NOT NULL DEFAULT 'LESER',
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "letzterLogin" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "aktion" TEXT NOT NULL,
    "betroffenerMitarbeiterId" TEXT,
    "zeitpunkt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Einstellung" (
    "id" TEXT NOT NULL,
    "schluessel" TEXT NOT NULL,
    "wert" JSONB NOT NULL,
    "geaendertAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Einstellung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mitarbeiter_personalnummer_key" ON "Mitarbeiter"("personalnummer");

-- CreateIndex
CREATE INDEX "Mitarbeiter_nachname_vorname_idx" ON "Mitarbeiter"("nachname", "vorname");

-- CreateIndex
CREATE INDEX "Beschaeftigung_mitarbeiterId_gueltigAb_idx" ON "Beschaeftigung"("mitarbeiterId", "gueltigAb");

-- CreateIndex
CREATE INDEX "Aenderungsanfrage_status_eingegangenAm_idx" ON "Aenderungsanfrage"("status", "eingegangenAm");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_zeitpunkt_idx" ON "AuditLog"("zeitpunkt");

-- CreateIndex
CREATE INDEX "AuditLog_betroffenerMitarbeiterId_idx" ON "AuditLog"("betroffenerMitarbeiterId");

-- CreateIndex
CREATE UNIQUE INDEX "Einstellung_schluessel_key" ON "Einstellung"("schluessel");

-- AddForeignKey
ALTER TABLE "Beschaeftigung" ADD CONSTRAINT "Beschaeftigung_mitarbeiterId_fkey" FOREIGN KEY ("mitarbeiterId") REFERENCES "Mitarbeiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beschaeftigung" ADD CONSTRAINT "Beschaeftigung_aenderungsanfrageId_fkey" FOREIGN KEY ("aenderungsanfrageId") REFERENCES "Aenderungsanfrage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
