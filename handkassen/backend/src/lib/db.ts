import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

// Ein einziger Prisma-Client für die gesamte Anwendung (Prisma 7: Verbindung
// über den Postgres-Treiber-Adapter statt nativer Query-Engine).
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
