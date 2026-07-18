import { NextRequest, NextResponse } from "next/server";

import {
  getPreviousColomboReportDate,
  isValidReportDate,
  runErpSyncFailureEmailForCompany,
} from "@/lib/erp-sync-failure-email";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date")?.trim();
  const reportDate =
    dateParam && isValidReportDate(dateParam) ? dateParam : getPreviousColomboReportDate();

  const configs = await prisma.erpSyncFailureEmailConfig.findMany({
    where: { enabled: true },
    select: { companyId: true },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const config of configs) {
    const result = await runErpSyncFailureEmailForCompany({
      companyId: config.companyId,
      reportDate,
      source: "cron",
    });
    if (result.status === "sent") sent += 1;
    else if (result.status === "failed") failed += 1;
    else skipped += 1;
  }

  return NextResponse.json({
    ok: true,
    reportDate,
    processed: configs.length,
    sent,
    skipped,
    failed,
  });
}
