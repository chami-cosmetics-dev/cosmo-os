import { randomUUID } from "crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const AUDIT_LOG_MODULES = ["reports", "users", "roles", "orders"] as const;

export const AUDIT_LOG_ACTIONS = [
  "download",
  "invite_created",
  "invite_resent",
  "invite_cancelled",
  "user_deleted",
  "user_roles_updated",
  "role_created",
  "role_updated",
  "role_deleted",
  "manual_order_created",
  "fulfillment_updated",
  "remark_created",
  "remark_updated",
  "remark_deleted",
] as const;

export type AuditLogModule = (typeof AUDIT_LOG_MODULES)[number];
export type AuditLogAction = (typeof AUDIT_LOG_ACTIONS)[number];

export type AuditLogEntry = {
  id: string;
  module: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  actorUserId: string | null;
  actorUserName: string | null;
  actorUserEmail: string | null;
  beforeData: unknown;
  afterData: unknown;
  metadata: unknown;
  createdAt: string;
};

type AuditLogWriteInput = {
  companyId?: string | null;
  actorUserId?: string | null;
  module: AuditLogModule;
  action: AuditLogAction;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: unknown;
};

type AuditLogQueryInput = {
  companyId?: string | null;
  module?: string;
  action?: string;
  query?: string;
  limit?: number;
};

const MASKED_KEY_PATTERN = /password|secret|token/i;

function isKnownMissingAuditTableError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ["P2021", "P2022"].includes((error as { code?: string }).code ?? "")
  );
}

function sanitizeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      MASKED_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeAuditValue(entryValue),
    ]);

    return Object.fromEntries(entries);
  }

  return value;
}

function toJsonbValue(value: unknown) {
  if (value === undefined) {
    return null;
  }

  return JSON.stringify(sanitizeAuditValue(value));
}

export async function writeAuditLog(input: AuditLogWriteInput) {
  try {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "AuditLog" (
          "id",
          "companyId",
          "actorUserId",
          "module",
          "action",
          "entityType",
          "entityId",
          "summary",
          "beforeData",
          "afterData",
          "metadata",
          "createdAt"
        )
        VALUES (
          ${randomUUID()},
          ${input.companyId ?? null},
          ${input.actorUserId ?? null},
          ${input.module},
          ${input.action},
          ${input.entityType ?? null},
          ${input.entityId ?? null},
          ${input.summary},
          ${toJsonbValue(input.beforeData)}::jsonb,
          ${toJsonbValue(input.afterData)}::jsonb,
          ${toJsonbValue(input.metadata)}::jsonb,
          NOW()
        )
      `
    );
  } catch (error) {
    if (!isKnownMissingAuditTableError(error)) {
      console.error("Failed to write audit log:", error);
    }
  }
}

export async function fetchAuditLogs(input: AuditLogQueryInput) {
  const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(input.limit ?? 50, 100)) : 50;
  const queryLike = input.query?.trim() ? `%${input.query.trim()}%` : null;

  try {
    const rows = await prisma.$queryRaw<Array<{
      id: string;
      module: string;
      action: string;
      entityType: string | null;
      entityId: string | null;
      summary: string;
      actorUserId: string | null;
      actorUserName: string | null;
      actorUserEmail: string | null;
      beforeData: unknown;
      afterData: unknown;
      metadata: unknown;
      createdAt: Date;
    }>>(
      Prisma.sql`
        SELECT
          a."id",
          a."module",
          a."action",
          a."entityType",
          a."entityId",
          a."summary",
          a."actorUserId",
          u."name" AS "actorUserName",
          u."email" AS "actorUserEmail",
          a."beforeData",
          a."afterData",
          a."metadata",
          a."createdAt"
        FROM "AuditLog" a
        LEFT JOIN "User" u ON u."id" = a."actorUserId"
        WHERE (${input.companyId ?? null}::text IS NULL OR a."companyId" = ${input.companyId ?? null})
          AND (${input.module ?? null}::text IS NULL OR a."module" = ${input.module ?? null})
          AND (${input.action ?? null}::text IS NULL OR a."action" = ${input.action ?? null})
          AND (
            ${queryLike}::text IS NULL
            OR COALESCE(u."name", '') ILIKE ${queryLike}
            OR COALESCE(u."email", '') ILIKE ${queryLike}
            OR a."summary" ILIKE ${queryLike}
            OR COALESCE(a."entityId", '') ILIKE ${queryLike}
          )
        ORDER BY a."createdAt" DESC
        LIMIT ${safeLimit}
      `
    );

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })) satisfies AuditLogEntry[];
  } catch (error) {
    if (!isKnownMissingAuditTableError(error)) {
      console.error("Failed to read audit logs:", error);
    }
    return [] satisfies AuditLogEntry[];
  }
}
