import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ComplaintStatus = "open" | "in_progress" | "resolved";

export type ComplaintItem = {
  id: string;
  title: string;
  description: string;
  status: ComplaintStatus;
  createdById: string;
  createdByName: string | null;
  createdByEmail: string | null;
  resolvedByName: string | null;
  resolvedByEmail: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type FetchComplaintsInput = {
  companyId: string;
  userId: string;
  canReadAll: boolean;
  status?: ComplaintStatus | "all";
  limit?: number;
};

function toComplaintStatus(value: string): ComplaintStatus {
  if (value === "in_progress" || value === "resolved") return value;
  return "open";
}

export function isMissingComplaintTableError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2010" &&
      "meta" in error &&
      typeof (error as { meta?: { code?: string } }).meta === "object" &&
      (error as { meta?: { code?: string } }).meta?.code === "42P01"
  );
}

export async function fetchComplaints(input: FetchComplaintsInput) {
  const safeLimit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const status = input.status && input.status !== "all" ? input.status : null;

  let rows: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    createdById: string;
    createdByName: string | null;
    createdByEmail: string | null;
    resolvedByName: string | null;
    resolvedByEmail: string | null;
    resolution: string | null;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;

  try {
    rows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          c."id",
          c."title",
          c."description",
          c."status",
          c."createdById",
          creator."name" AS "createdByName",
          creator."email" AS "createdByEmail",
          resolver."name" AS "resolvedByName",
          resolver."email" AS "resolvedByEmail",
          c."resolution",
          c."resolvedAt",
          c."createdAt",
          c."updatedAt"
        FROM "Complaint" c
        LEFT JOIN "User" creator ON creator."id" = c."createdById"
        LEFT JOIN "User" resolver ON resolver."id" = c."resolvedById"
        WHERE c."companyId" = ${input.companyId}
          AND (${input.canReadAll}::boolean OR c."createdById" = ${input.userId})
          AND (${status}::text IS NULL OR c."status" = ${status})
        ORDER BY c."createdAt" DESC
        LIMIT ${safeLimit}
      `
    );
  } catch (error) {
    if (isMissingComplaintTableError(error)) {
      return [] satisfies ComplaintItem[];
    }
    throw error;
  }

  return rows.map((row) => ({
    ...row,
    status: toComplaintStatus(row.status),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })) satisfies ComplaintItem[];
}
