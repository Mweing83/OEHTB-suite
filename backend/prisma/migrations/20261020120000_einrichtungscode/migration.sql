-- Einmaliger Einrichtungscode fuer das Erst-/Neusetzen des Passworts.
ALTER TABLE "suite_user" ADD COLUMN "einrichtungsCodeHash" TEXT;
ALTER TABLE "suite_user" ADD COLUMN "einrichtungsCodeBis" TIMESTAMP(3);
