-- CreateTable
CREATE TABLE "backup_konfig" (
    "id" SERIAL NOT NULL,
    "uhrzeit" TEXT NOT NULL DEFAULT '02:00',
    "aufbewahrung_taeglich" INTEGER NOT NULL DEFAULT 14,
    "aufbewahrung_monatlich" INTEGER NOT NULL DEFAULT 12,
    "ziel_nas_aktiv" BOOLEAN NOT NULL DEFAULT true,
    "ziel_usb_aktiv" BOOLEAN NOT NULL DEFAULT true,
    "lauf_angefordert" BOOLEAN NOT NULL DEFAULT false,
    "letzter_lauf_am" TIMESTAMP(3),
    "letzter_erfolg" BOOLEAN NOT NULL DEFAULT false,
    "letzte_meldung" TEXT,
    "bericht" TEXT,

    CONSTRAINT "backup_konfig_pkey" PRIMARY KEY ("id")
);
