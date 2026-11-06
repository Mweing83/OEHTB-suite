-- Mehrere Firmen (Key-User-Feedback 2026-11, Punkt 8). Bestehende Konten und
-- Kostenstellen werden der ersten Firma zugeordnet und in der Verwaltung
-- umgehängt bzw. bereinigt.
CREATE TABLE "firma" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "firma_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "firma_name_key" ON "firma"("name");

INSERT INTO "firma" ("id", "name") VALUES
  (1, 'ÖHTB Dienstleistungen GmbH'),
  (2, 'ÖHTB Arbeiten GmbH'),
  (3, 'ÖHTB Wohnen GmbH'),
  (4, 'ÖHTB Verein');
SELECT setval(pg_get_serial_sequence('"firma"', 'id'), 4);

ALTER TABLE "kostenstelle" ADD COLUMN "firmaId" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "kostenstelle_firmaId_idx" ON "kostenstelle"("firmaId");
ALTER TABLE "kostenstelle" ADD CONSTRAINT "kostenstelle_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "konto" ADD COLUMN "firmaId" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "konto_nummer_key";
CREATE UNIQUE INDEX "konto_firmaId_nummer_key" ON "konto"("firmaId", "nummer");
ALTER TABLE "konto" ADD CONSTRAINT "konto_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
