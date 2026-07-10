-- CreateTable
CREATE TABLE "allgemein_konfig" (
    "id" SERIAL NOT NULL,
    "sperr_frist_tage" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "allgemein_konfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monats_sperre" (
    "id" SERIAL NOT NULL,
    "kostenstelle_id" INTEGER NOT NULL,
    "jahr" INTEGER NOT NULL,
    "monat" INTEGER NOT NULL,
    "gesperrt" BOOLEAN NOT NULL,
    "geaendert_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monats_sperre_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monats_sperre_kostenstelle_id_jahr_monat_key" ON "monats_sperre"("kostenstelle_id", "jahr", "monat");

-- AddForeignKey
ALTER TABLE "monats_sperre" ADD CONSTRAINT "monats_sperre_kostenstelle_id_fkey" FOREIGN KEY ("kostenstelle_id") REFERENCES "kostenstelle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
