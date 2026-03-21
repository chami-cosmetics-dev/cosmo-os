import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getRuntimeDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    const isNeonPooler = url.hostname.includes("-pooler.");

    if (isNeonPooler) {
      // Prisma + pooled Neon works more reliably with pgbouncer mode.
      if (!url.searchParams.has("pgbouncer")) {
        url.searchParams.set("pgbouncer", "true");
      }
      if (!url.searchParams.has("connect_timeout")) {
        url.searchParams.set("connect_timeout", "15");
      }
      // Some environments close pooled connections when channel binding is required.
      if (url.searchParams.get("channel_binding") === "require") {
        url.searchParams.delete("channel_binding");
      }
    }

    return url.toString();
  } catch {
    return raw;
  }
}

function createPrisma() {
  const dbUrl = getRuntimeDatabaseUrl();
  const logQueries = process.env.PRISMA_LOG_QUERIES === "1";
  const slowQueryMs = Number(process.env.PRISMA_SLOW_QUERY_MS ?? 250);

  const client = new PrismaClient({
    ...(dbUrl
      ? {
          datasources: {
            db: { url: dbUrl },
          },
        }
      : {}),
    log: logQueries || process.env.NODE_ENV === "development"
      ? [{ emit: "event", level: "query" }, "error", "warn"]
      : ["error"],
  });

  if (logQueries) {
    client.$on("query", (event) => {
      if (event.duration < slowQueryMs) return;
      console.warn(
        `[prisma][slow-query] ${event.duration}ms ${event.target} ${event.query}`
      );
    });
  }

  return client;
}

// In dev: if cached client is missing newer models (e.g. after schema change + prisma generate),
// create a fresh instance so we don't get "Cannot read properties of undefined"
let instance = globalForPrisma.prisma;
if (instance && process.env.NODE_ENV !== "production") {
  if (!("smsNotificationConfig" in instance)) {
    void (instance as PrismaClient).$disconnect();
    globalForPrisma.prisma = undefined;
    instance = undefined;
  }
}

export const prisma = instance ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
