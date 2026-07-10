-- CreateEnum
CREATE TYPE "Rolle" AS ENUM ('erfasser', 'leitung', 'finanzen', 'admin');

-- CreateEnum
CREATE TYPE "Kassenart" AS ENUM ('klientenkasse', 'einrichtung');

-- CreateEnum
CREATE TYPE "Bereich" AS ENUM ('VBW', 'GVB', 'TBW');

-- CreateEnum
CREATE TYPE "BuchungsTyp" AS ENUM ('eingang', 'ausgang');

-- CreateEnum
CREATE TYPE "AbschlussStatus" AS ENUM ('offen', 'eingereicht', 'geprueft', 'freigegeben');

-- CreateTable
CREATE TABLE "benutzer" (
    "id" SERIAL NOT NULL,
    "benutzername" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwortHash" TEXT NOT NULL,
    "rolle" "Rolle" NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benutzer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kostenstelle" (
    "id" SERIAL NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "bereich" "Bereich" NOT NULL,
    "kassenart" "Kassenart" NOT NULL,
    "saldoCent" INTEGER NOT NULL DEFAULT 0,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "kostenstelle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benutzer_kostenstelle" (
    "benutzerId" INTEGER NOT NULL,
    "kostenstelleId" INTEGER NOT NULL,

    CONSTRAINT "benutzer_kostenstelle_pkey" PRIMARY KEY ("benutzerId","kostenstelleId")
);

-- CreateTable
CREATE TABLE "konto" (
    "id" SERIAL NOT NULL,
    "nummer" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "beschreibung" TEXT,
    "anmerkung" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "konto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buchung" (
    "id" SERIAL NOT NULL,
    "buchungsnummer" INTEGER NOT NULL,
    "buchungsdatum" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "belegdatum" TIMESTAMP(3) NOT NULL,
    "betragCent" INTEGER NOT NULL,
    "typ" "BuchungsTyp" NOT NULL,
    "beschreibung" TEXT,
    "kostenstelleId" INTEGER NOT NULL,
    "erstellerId" INTEGER NOT NULL,
    "belegId" INTEGER,
    "gesperrt" BOOLEAN NOT NULL DEFAULT false,
    "storniert" BOOLEAN NOT NULL DEFAULT false,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buchung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buchungsposition" (
    "id" SERIAL NOT NULL,
    "buchungId" INTEGER NOT NULL,
    "betragCent" INTEGER NOT NULL,
    "steuersatz" INTEGER NOT NULL,
    "kontoId" INTEGER NOT NULL,

    CONSTRAINT "buchungsposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beleg" (
    "id" SERIAL NOT NULL,
    "dateipfad" TEXT NOT NULL,
    "originalname" TEXT NOT NULL,
    "hochgeladenAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beleg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abschluss" (
    "id" SERIAL NOT NULL,
    "kostenstelleId" INTEGER NOT NULL,
    "jahr" INTEGER NOT NULL,
    "monat" INTEGER NOT NULL,
    "zaehllisteCent" INTEGER NOT NULL,
    "status" "AbschlussStatus" NOT NULL DEFAULT 'offen',
    "eingereichtAm" TIMESTAMP(3),
    "geprueftAm" TIMESTAMP(3),
    "freigegebenAm" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abschluss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "zeitpunkt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "benutzerId" INTEGER,
    "aktion" TEXT NOT NULL,
    "entitaet" TEXT NOT NULL,
    "entitaetId" INTEGER,
    "alteWerte" JSONB,
    "neueWerte" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "benutzer_benutzername_key" ON "benutzer"("benutzername");

-- CreateIndex
CREATE UNIQUE INDEX "konto_nummer_key" ON "konto"("nummer");

-- CreateIndex
CREATE UNIQUE INDEX "buchung_buchungsnummer_key" ON "buchung"("buchungsnummer");

-- CreateIndex
CREATE UNIQUE INDEX "buchung_belegId_key" ON "buchung"("belegId");

-- CreateIndex
CREATE INDEX "buchung_kostenstelleId_idx" ON "buchung"("kostenstelleId");

-- CreateIndex
CREATE INDEX "buchungsposition_buchungId_idx" ON "buchungsposition"("buchungId");

-- CreateIndex
CREATE UNIQUE INDEX "abschluss_kostenstelleId_jahr_monat_key" ON "abschluss"("kostenstelleId", "jahr", "monat");

-- CreateIndex
CREATE INDEX "audit_log_entitaet_entitaetId_idx" ON "audit_log"("entitaet", "entitaetId");

-- AddForeignKey
ALTER TABLE "benutzer_kostenstelle" ADD CONSTRAINT "benutzer_kostenstelle_benutzerId_fkey" FOREIGN KEY ("benutzerId") REFERENCES "benutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benutzer_kostenstelle" ADD CONSTRAINT "benutzer_kostenstelle_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchung" ADD CONSTRAINT "buchung_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchung" ADD CONSTRAINT "buchung_erstellerId_fkey" FOREIGN KEY ("erstellerId") REFERENCES "benutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchung" ADD CONSTRAINT "buchung_belegId_fkey" FOREIGN KEY ("belegId") REFERENCES "beleg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungsposition" ADD CONSTRAINT "buchungsposition_buchungId_fkey" FOREIGN KEY ("buchungId") REFERENCES "buchung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungsposition" ADD CONSTRAINT "buchungsposition_kontoId_fkey" FOREIGN KEY ("kontoId") REFERENCES "konto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abschluss" ADD CONSTRAINT "abschluss_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_benutzerId_fkey" FOREIGN KEY ("benutzerId") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
