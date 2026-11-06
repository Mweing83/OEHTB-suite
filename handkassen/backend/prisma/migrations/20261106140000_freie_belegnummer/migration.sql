-- Frei gewordene Belegnummern (Löschen von Buchungen, Key-User-Feedback 2026-11, Punkt 3)
CREATE TABLE "freie_belegnummer" (
    "id" SERIAL NOT NULL,
    "kostenstelleId" INTEGER NOT NULL,
    "belegJahr" INTEGER NOT NULL,
    "belegLaufnummer" INTEGER NOT NULL,
    "belegnummer" TEXT NOT NULL,
    "monat" INTEGER NOT NULL,
    "freiSeit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freie_belegnummer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "freie_belegnummer_kostenstelleId_belegJahr_belegLaufnummer_key" ON "freie_belegnummer"("kostenstelleId", "belegJahr", "belegLaufnummer");
CREATE INDEX "freie_belegnummer_kostenstelleId_belegJahr_monat_idx" ON "freie_belegnummer"("kostenstelleId", "belegJahr", "monat");

ALTER TABLE "freie_belegnummer" ADD CONSTRAINT "freie_belegnummer_kostenstelleId_fkey" FOREIGN KEY ("kostenstelleId") REFERENCES "kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
