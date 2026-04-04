import "server-only";
import { createRequire } from "module";
import type { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const require = createRequire(import.meta.url);

type PrismaModule = {
  PrismaClient: new (options?: ConstructorParameters<typeof import("@prisma/client").PrismaClient>[0]) => PrismaClient;
};

function loadPrismaModule() {
  return require("@prisma/client") as PrismaModule;
}

function clearPrismaModuleCache() {
  const moduleIds = [
    "@prisma/client",
    ".prisma/client",
    "@prisma/client/default",
    ".prisma/client/default",
  ];

  for (const id of moduleIds) {
    try {
      const resolved = require.resolve(id);
      delete require.cache[resolved];
    } catch {
      /* module not resolved in this environment */
    }
  }
}

function hasModelField(
  client: PrismaClient,
  modelName: string,
  fieldName: string
) {
  const runtimeDataModel = (
    client as PrismaClient & {
      _runtimeDataModel?: {
        models?: Record<string, { fields?: Array<{ name?: string }> }>;
      };
    }
  )._runtimeDataModel;

  const fields = runtimeDataModel?.models?.[modelName]?.fields ?? [];
  return fields.some((field) => field.name === fieldName);
}

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
  const { PrismaClient } = loadPrismaModule();
  const dbUrl = getRuntimeDatabaseUrl();
  const enableQueryEvents =
    process.env.NODE_ENV === "development" ||
    process.env.PRISMA_LOG_SLOW_QUERIES === "true";

  const client = new PrismaClient({
    ...(dbUrl
      ? {
          datasources: {
            db: { url: dbUrl },
          },
        }
      : {}),
    log: enableQueryEvents
      ? [{ emit: "event", level: "query" }, "error", "warn"]
      : ["error"],
  });

  if (enableQueryEvents) {
    const slowMs = Number(process.env.PRISMA_SLOW_QUERY_MS ?? "250");
    const sampleRate = Number(process.env.PRISMA_SLOW_QUERY_SAMPLE_RATE ?? "1");

    client.$on("query", (event) => {
      if (!Number.isFinite(event.duration) || event.duration < slowMs) {
        return;
      }
      if (sampleRate < 1 && Math.random() > Math.max(0, sampleRate)) {
        return;
      }

      console.warn(
        `[Prisma Slow Query] ${event.duration}ms`,
        {
          paramsLength: event.params?.length ?? 0,
          target: event.target,
          query: event.query,
        }
      );
    });
  }

  return client;
}

// In dev: if cached client is missing newer models (e.g. after schema change + prisma generate),
// create a fresh instance so we don't get "Cannot read properties of undefined"
let instance = globalForPrisma.prisma;
if (instance && process.env.NODE_ENV !== "production") {
  if (
    !("smsNotificationConfig" in instance) ||
    !hasModelField(instance, "CompanyLocation", "manualInvoicePrefix")
  ) {
    void (instance as PrismaClient).$disconnect();
    clearPrismaModuleCache();
    globalForPrisma.prisma = undefined;
    instance = undefined;
  }
}

export const prisma = instance ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
