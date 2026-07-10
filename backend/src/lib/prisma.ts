import { PrismaClient } from "@prisma/client";

// Ein gemeinsamer Prisma-Client fuer das gesamte Backend.
export const prisma = new PrismaClient();
