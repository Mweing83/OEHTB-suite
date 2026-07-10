-- AlterTable: E-Mail wird optional (kein synthetischer Platzhalter mehr).
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable: Tombstone-Flag fuer zentral geloeschte Benutzer.
ALTER TABLE "User" ADD COLUMN "geloescht" BOOLEAN NOT NULL DEFAULT false;
