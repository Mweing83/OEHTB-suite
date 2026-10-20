import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Ein gemeinsamer Prisma-Client fuer das gesamte Backend (Prisma 7: Verbindung
// ueber den Postgres-Treiber-Adapter statt nativer Query-Engine).
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
