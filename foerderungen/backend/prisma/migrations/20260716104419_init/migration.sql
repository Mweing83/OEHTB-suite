-- CreateEnum
CREATE TYPE "Ebene" AS ENUM ('BUND', 'LAND', 'GEMEINDE', 'EU', 'PRIVAT');

-- CreateEnum
CREATE TYPE "Kategorie" AS ENUM ('PROJEKT', 'KERNGESCHAEFT', 'BEIDES');

-- CreateEnum
CREATE TYPE "QuelleStatus" AS ENUM ('AKTIV', 'VORGESCHLAGEN', 'ARCHIVIERT');

-- CreateEnum
CREATE TYPE "Herkunft" AS ENUM ('MANUELL', 'SCAN');

-- CreateEnum
CREATE TYPE "AusschreibungStatus" AS ENUM ('OFFEN', 'VORGESCHLAGEN', 'ABGELAUFEN', 'ABGELEHNT');

-- CreateEnum
CREATE TYPE "ScanAusloeser" AS ENUM ('ZEITPLAN', 'MANUELL');

-- CreateEnum
CREATE TYPE "Rolle" AS ENUM ('NUTZER');

-- CreateTable
CREATE TABLE "Foerderquelle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "traeger" TEXT NOT NULL,
    "ebene" "Ebene" NOT NULL,
    "kategorie" "Kategorie" NOT NULL,
    "themen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "beschreibung" TEXT NOT NULL DEFAULT '',
    "webseite" TEXT,
    "kontakt" TEXT,
    "status" "QuelleStatus" NOT NULL DEFAULT 'AKTIV',
    "quelleTyp" "Herkunft" NOT NULL DEFAULT 'MANUELL',
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Foerderquelle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ausschreibung" (
    "id" TEXT NOT NULL,
    "foerderquelleId" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "beschreibung" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    "linkNormalisiert" TEXT,
    "frist" DATE,
    "laufendEinreichbar" BOOLEAN NOT NULL DEFAULT false,
    "foerderhoehe" TEXT,
    "status" "AusschreibungStatus" NOT NULL DEFAULT 'OFFEN',
    "quelleTyp" "Herkunft" NOT NULL DEFAULT 'MANUELL',
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAusschreibungId" TEXT,

    CONSTRAINT "Ausschreibung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanLauf" (
    "id" TEXT NOT NULL,
    "gestartet" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beendet" TIMESTAMP(3),
    "ausloeser" "ScanAusloeser" NOT NULL,
    "statistik" JSONB,
    "fehler" TEXT,

    CONSTRAINT "ScanLauf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "suiteUserId" TEXT,
    "name" TEXT,
    "rolle" "Rolle" NOT NULL DEFAULT 'NUTZER',
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "geloescht" BOOLEAN NOT NULL DEFAULT false,
    "letzterLogin" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "aktion" TEXT NOT NULL,
    "zeitpunkt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "Foerderquelle_status_idx" ON "Foerderquelle"("status");

-- CreateIndex
CREATE INDEX "Ausschreibung_status_frist_idx" ON "Ausschreibung"("status", "frist");

-- CreateIndex
CREATE INDEX "Ausschreibung_linkNormalisiert_idx" ON "Ausschreibung"("linkNormalisiert");

-- CreateIndex
CREATE INDEX "Ausschreibung_foerderquelleId_idx" ON "Ausschreibung"("foerderquelleId");

-- CreateIndex
CREATE INDEX "ScanLauf_gestartet_idx" ON "ScanLauf"("gestartet");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_suiteUserId_key" ON "User"("suiteUserId");

-- CreateIndex
CREATE INDEX "audit_log_zeitpunkt_idx" ON "audit_log"("zeitpunkt");

-- CreateIndex
CREATE UNIQUE INDEX "Einstellung_schluessel_key" ON "Einstellung"("schluessel");

-- AddForeignKey
ALTER TABLE "Ausschreibung" ADD CONSTRAINT "Ausschreibung_foerderquelleId_fkey" FOREIGN KEY ("foerderquelleId") REFERENCES "Foerderquelle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausschreibung" ADD CONSTRAINT "Ausschreibung_aktualisiertAusschreibungId_fkey" FOREIGN KEY ("aktualisiertAusschreibungId") REFERENCES "Ausschreibung"("id") ON DELETE CASCADE ON UPDATE CASCADE;
