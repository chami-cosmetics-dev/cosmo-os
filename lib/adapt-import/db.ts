import type { PrismaClient } from "@prisma/client";

/** Prisma client injectable for CLI (no `server-only`) and Next API routes. */
export type AdaptImportDb = PrismaClient;
