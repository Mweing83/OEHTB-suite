-- Fixer Steuersatz je Konto (Key-User-Feedback 2026-11, Punkt 2)
ALTER TABLE "konto" ADD COLUMN "fixSteuersatz" DECIMAL(5,1);
