import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma-7-Konfiguration: Datenbank-URL, Migrationen und Seed (vorher im
// Schema bzw. package.json). Ohne DATABASE_URL (z. B. beim Image-Build fuer
// "prisma generate") bleibt die URL leer; Migrationen brauchen sie natuerlich.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
