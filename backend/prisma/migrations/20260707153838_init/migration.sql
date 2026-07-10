-- CreateTable
CREATE TABLE "suite_user" (
    "id" TEXT NOT NULL,
    "benutzername" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwortHash" TEXT,
    "passwortSetzen" BOOLEAN NOT NULL DEFAULT true,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "letzterLogin" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suite_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beschreibung" TEXT,
    "pfad" TEXT NOT NULL,
    "rollen" JSONB NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "reihenfolge" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zugriff" (
    "userId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "rolle" TEXT NOT NULL,

    CONSTRAINT "zugriff_pkey" PRIMARY KEY ("userId","toolId")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "aktion" TEXT NOT NULL,
    "zeitpunkt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suite_user_benutzername_key" ON "suite_user"("benutzername");

-- CreateIndex
CREATE UNIQUE INDEX "tool_slug_key" ON "tool"("slug");

-- CreateIndex
CREATE INDEX "audit_log_zeitpunkt_idx" ON "audit_log"("zeitpunkt");

-- AddForeignKey
ALTER TABLE "zugriff" ADD CONSTRAINT "zugriff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "suite_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zugriff" ADD CONSTRAINT "zugriff_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
