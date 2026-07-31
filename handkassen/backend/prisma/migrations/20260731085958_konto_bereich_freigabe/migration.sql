-- CreateTable
CREATE TABLE "bereich_konto" (
    "bereichId" INTEGER NOT NULL,
    "kontoId" INTEGER NOT NULL,

    CONSTRAINT "bereich_konto_pkey" PRIMARY KEY ("bereichId","kontoId")
);

-- AddForeignKey
ALTER TABLE "bereich_konto" ADD CONSTRAINT "bereich_konto_bereichId_fkey" FOREIGN KEY ("bereichId") REFERENCES "bereich"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bereich_konto" ADD CONSTRAINT "bereich_konto_kontoId_fkey" FOREIGN KEY ("kontoId") REFERENCES "konto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bestandsdaten uebernehmen: alle vorhandenen Konten fuer alle Bereiche freigeben.
INSERT INTO "bereich_konto" ("bereichId", "kontoId")
SELECT b."id", k."id" FROM "bereich" b CROSS JOIN "konto" k
ON CONFLICT DO NOTHING;
