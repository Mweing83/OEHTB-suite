import { PrismaClient } from "@prisma/client";

// Einzelne, gemeinsam genutzte Prisma-Instanz.
export const prisma = new PrismaClient();
