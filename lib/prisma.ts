import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrisma() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

// In dev: if cached client is missing newer models (e.g. after schema change + prisma generate),
// create a fresh instance so we don't get "Cannot read properties of undefined"
let instance = globalForPrisma.prisma;
if (instance && process.env.NODE_ENV !== "production") {
  if (!("smsNotificationConfig" in instance)) {
    void instance.$disconnect();
    globalForPrisma.prisma = undefined;
    instance = undefined;
  }
}

export const prisma = instance ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
