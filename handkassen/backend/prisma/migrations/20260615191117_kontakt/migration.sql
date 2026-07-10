-- AlterTable
ALTER TABLE "allgemein_konfig" ADD COLUMN     "kontakt_email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kontakt_hinweis" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kontakt_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kontakt_telefon" TEXT NOT NULL DEFAULT '';
