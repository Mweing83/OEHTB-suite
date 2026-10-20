-- Token-Generation: Passwortwechsel/Logout machen aeltere Tokens ungueltig.
ALTER TABLE "suite_user" ADD COLUMN "tokenGeneration" INTEGER NOT NULL DEFAULT 0;
