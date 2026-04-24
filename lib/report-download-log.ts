import { randomUUID } from "crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ReportDownloadLogInput = {
  companyId: string;
  userId?: string | null;
  reportKey: string;
  reportLabel: string;
  filters?: string | null;
  fileName: string;
};

export type ReportDownloadLogRecord = {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  reportKey: string;
  reportLabel: string;
  filters: string | null;
  fileName: string;
  createdAt: string;
};

function isMissingReportLogTableError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (((error as { code?: string }).code === "P2021") || ((error as { code?: string }).code === "P2022"))
  );
}

export async function logReportDownload(input: ReportDownloadLogInput) {
  if (!input.userId) {
    return;
  }

  try {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "ReportDownloadLog" (
          "id",
          "companyId",
          "userId",
          "reportKey",
          "reportLabel",
          "filters",
          "fileName",
          "createdAt"
        )
        VALUES (
          ${randomUUID()},
          ${input.companyId},
          ${input.userId},
          ${input.reportKey},
          ${input.reportLabel},
          ${input.filters ?? null},
          ${input.fileName},
          NOW()
        )
      `
    );
  } catch (error) {
    if (!isMissingReportLogTableError(error)) {
      console.error("Failed to write report download log:", error);
    }
  }
}

export async function fetchRecentReportDownloadLogs(companyId: string, limit = 12) {
  try {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 50)) : 12;
    const rows = await prisma.$queryRaw<Array<{
      id: string;
      userId: string | null;
      userName: string | null;
      userEmail: string | null;
      reportKey: string;
      reportLabel: string;
      filters: string | null;
      fileName: string;
      createdAt: Date;
    }>>(
      Prisma.sql`
        SELECT
          l."id",
          l."userId",
          u."name" AS "userName",
          u."email" AS "userEmail",
          l."reportKey",
          l."reportLabel",
          l."filters",
          l."fileName",
          l."createdAt"
        FROM "ReportDownloadLog" l
        LEFT JOIN "User" u ON u."id" = l."userId"
        WHERE l."companyId" = ${companyId}
        ORDER BY l."createdAt" DESC
        LIMIT ${safeLimit}
      `
    );

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })) satisfies ReportDownloadLogRecord[];
  } catch (error) {
    if (!isMissingReportLogTableError(error)) {
      console.error("Failed to read report download logs:", error);
    }
    return [] satisfies ReportDownloadLogRecord[];
  }
}
