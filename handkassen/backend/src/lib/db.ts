import { PrismaClient } from "@prisma/client";

// Ein einziger Prisma-Client für die gesamte Anwendung.
export const prisma = new PrismaClient();
