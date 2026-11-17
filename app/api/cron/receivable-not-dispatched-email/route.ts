import { NextRequest, NextResponse } from "next/server";

import { RECEIVABLE_NOT_DISPATCHED_DAILY_KEY } from "@/lib/email-templates/catalog";
import { getCurrentColomboReportDate } from "@/lib/grn-pending-email";
import { runReceivableOutstandingDailyEmail } from "@/lib/receivable-outstanding-email";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !secret ? process.env.NODE_ENV !== "production" : request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Daily at 00:00 Asia/Colombo (18:30 UTC on the prior calendar day). */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.emailTemplate.findMany({
    where: { key: RECEIVABLE_NOT_DISPATCHED_DAILY_KEY, recipients: { not: "" } },
    select: { companyId: true },
    distinct: ["companyId"],
  });
  const reportDate = getCurrentColomboReportDate();
  const results = [];
  for (const row of templates) {
    try {
      await runReceivableOutstandingDailyEmail(row.companyId, reportDate, {
        detailKeys: [RECEIVABLE_NOT_DISPATCHED_DAILY_KEY],
        includeOperationsSummary: false,
      });
      results.push({ companyId: row.companyId, status: "sent" });
    } catch (error) {
      results.push({ companyId: row.companyId, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  return NextResponse.json({ ok: true, reportDate, results });
}
