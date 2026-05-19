import { randomUUID } from "crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const AUDIT_LOG_MODULES = ["reports", "users", "roles", "orders", "contacts", "settings", "staff", "complaints", "academy", "products"] as const;

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
  "merchant_review_saved",
  "returned_order_recorded",
  "returned_order_updated",
  "returned_order_solved",
  "returned_order_rearranged",
  "exchange_created",
  "exchange_updated",
  "exchange_solved",
  "fulfillment_updated",
  "remark_created",
  "remark_updated",
  "remark_deleted",
  "contact_created",
  "contact_imported",
  "contact_follow_up_contacted",
  "contact_auto_created",
  "contact_auto_enriched",
  "contact_auto_sync_conflict",
  "contact_backfill_run",
  "setting_created",
  "setting_updated",
  "setting_deleted",
  "staff_updated",
  "staff_resigned",
  "complaint_created",
  "complaint_updated",
  "academy_explanation_created",
  "storage_file_uploaded",
  "storage_file_deleted",
] as const;

export type AuditLogModule = (typeof AUDIT_LOG_MODULES)[number];
export type AuditLogAction = (typeof AUDIT_LOG_ACTIONS)[number];

export const AUDIT_LOG_ACTION_GROUPS = [
  {
    key: "contacts",
    label: "Contacts",
    actions: [
      "contact_created",
      "contact_imported",
      "contact_follow_up_contacted",
      "contact_auto_created",
      "contact_auto_enriched",
      "contact_auto_sync_conflict",
      "contact_backfill_run",
    ],
  },
  {
    key: "orders",
    label: "Orders",
    actions: [
      "manual_order_created",
      "merchant_review_saved",
      "returned_order_recorded",
      "returned_order_updated",
      "returned_order_solved",
      "returned_order_rearranged",
      "exchange_created",
      "exchange_updated",
      "exchange_solved",
      "fulfillment_updated",
      "remark_created",
      "remark_updated",
      "remark_deleted",
    ],
  },
  {
    key: "users",
    label: "Users",
    actions: [
      "invite_created",
      "invite_resent",
      "invite_cancelled",
      "user_deleted",
      "user_roles_updated",
    ],
  },
  {
    key: "roles",
    label: "Roles",
    actions: ["role_created", "role_updated", "role_deleted"],
  },
  {
    key: "settings",
    label: "Settings",
    actions: ["setting_created", "setting_updated", "setting_deleted"],
  },
  {
    key: "staff",
    label: "Staff",
    actions: ["staff_updated", "staff_resigned"],
  },
  {
    key: "complaints",
    label: "Complaints",
    actions: ["complaint_created", "complaint_updated"],
  },
  {
    key: "reports",
    label: "Reports",
    actions: ["download"],
  },
  {
    key: "academy",
    label: "Academy",
    actions: ["academy_explanation_created"],
  },
  {
    key: "products",
    label: "Products",
    actions: ["storage_file_uploaded", "storage_file_deleted"],
  },
] as const;

export const AUDIT_LOG_ACTION_GROUP_PREFIX = "group:";

export function getAuditLogActionGroupActions(key: string | undefined) {
  const group = AUDIT_LOG_ACTION_GROUPS.find((item) => item.key === key);
  return group?.actions ?? null;
}

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

export const DEFAULT_AUDIT_EXCLUDED_ACTIONS = [
  "contact_auto_created",
  "contact_auto_enriched",
] as const;

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
  actions?: readonly string[];
  query?: string;
  excludeActions?: readonly string[];
  limit?: number;
  offset?: number;
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
  const safeOffset = Number.isFinite(input.offset)
    ? Math.max(0, input.offset ?? 0)
    : 0;
  const queryLike = input.query?.trim() ? `%${input.query.trim()}%` : null;
  const includedActions = input.actions ?? [];
  const excludedActions = input.excludeActions ?? [];

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
            ${includedActions.length === 0}::boolean
            OR a."action" IN (${Prisma.join(includedActions.length ? includedActions : ["__none__"])})
          )
          AND (
            ${excludedActions.length === 0}::boolean
            OR a."action" NOT IN (${Prisma.join(excludedActions.length ? excludedActions : ["__none__"])})
          )
          AND (
            ${queryLike}::text IS NULL
            OR COALESCE(u."name", '') ILIKE ${queryLike}
            OR COALESCE(u."email", '') ILIKE ${queryLike}
            OR a."summary" ILIKE ${queryLike}
            OR COALESCE(a."entityId", '') ILIKE ${queryLike}
        )
        ORDER BY a."createdAt" DESC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
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

export async function countAuditLogs(input: Omit<AuditLogQueryInput, "limit" | "offset">) {
  const queryLike = input.query?.trim() ? `%${input.query.trim()}%` : null;
  const includedActions = input.actions ?? [];
  const excludedActions = input.excludeActions ?? [];

  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "AuditLog" a
        LEFT JOIN "User" u ON u."id" = a."actorUserId"
        WHERE (${input.companyId ?? null}::text IS NULL OR a."companyId" = ${input.companyId ?? null})
          AND (${input.module ?? null}::text IS NULL OR a."module" = ${input.module ?? null})
          AND (${input.action ?? null}::text IS NULL OR a."action" = ${input.action ?? null})
          AND (
            ${includedActions.length === 0}::boolean
            OR a."action" IN (${Prisma.join(includedActions.length ? includedActions : ["__none__"])})
          )
          AND (
            ${excludedActions.length === 0}::boolean
            OR a."action" NOT IN (${Prisma.join(excludedActions.length ? excludedActions : ["__none__"])})
          )
          AND (
            ${queryLike}::text IS NULL
            OR COALESCE(u."name", '') ILIKE ${queryLike}
            OR COALESCE(u."email", '') ILIKE ${queryLike}
            OR a."summary" ILIKE ${queryLike}
            OR COALESCE(a."entityId", '') ILIKE ${queryLike}
          )
      `
    );

    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    if (!isKnownMissingAuditTableError(error)) {
      console.error("Failed to count audit logs:", error);
    }
    return 0;
  }
}

