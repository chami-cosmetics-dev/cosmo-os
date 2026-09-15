import { NextRequest, NextResponse } from "next/server";

import {
  clampPage,
  nightlyLogsQuerySchema,
  type DailySalesSmsLogDto,
  type NightlyLogsPagination,
  type OgfEmailLogDto,
} from "@/lib/nightly-logs";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 400 });
  }

  const parsed = nightlyLogsQuerySchema.safeParse({
    kind: request.nextUrl.searchParams.get("kind") ?? undefined,
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { kind, limit } = parsed.data;
  let page = parsed.data.page;

  if (kind === "sms") {
    const total = await prisma.dailySalesSmsSendLog.count({
      where: { companyId },
    });
    page = clampPage(page, limit, total);
    const rows = await prisma.dailySalesSmsSendLog.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const logs: DailySalesSmsLogDto[] = rows.map((row) => ({
      id: row.id,
      reportDate: row.reportDate,
      status: row.status,
      source: row.source,
      errorSummary: row.errorSummary,
      recipients: row.recipients,
      recipientCount: row.recipientCount,
      createdAt: row.createdAt.toISOString(),
    }));

    const pagination: NightlyLogsPagination = { page, limit, total };
    return NextResponse.json({ kind, logs, pagination });
  }

  const total = await prisma.ogfEmailLog.count({ where: { companyId } });
  page = clampPage(page, limit, total);
  const rows = await prisma.ogfEmailLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const logs: OgfEmailLogDto[] = rows.map((row) => ({
    id: row.id,
    batchCode: row.batchCode,
    orderCount: row.orderCount,
    emailTo: row.emailTo,
    status: row.status,
    errorMessage: row.errorMessage,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  }));

  const pagination: NightlyLogsPagination = { page, limit, total };
  return NextResponse.json({ kind, logs, pagination });
}
