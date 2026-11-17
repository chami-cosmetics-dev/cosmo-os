import { NextRequest, NextResponse } from "next/server";

import { RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY } from "@/lib/email-templates/catalog";
import { getCurrentColomboReportDate } from "@/lib/grn-pending-email";
import { runReceivableOutstandingDailyEmail } from "@/lib/receivable-outstanding-email";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !secret ? process.env.NODE_ENV !== "production" : request.headers.get("authorization") === `Bearer ${secret}`;
}

function daysBetween(from: string, to: string) {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Runs daily at 11:00 Asia/Colombo. A successful mail is due again after three
 * calendar days; a Sunday due date is deferred to Monday, which begins the next
 * three-day cycle.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reportDate = getCurrentColomboReportDate();
  const weekday = new Date(`${reportDate}T00:00:00Z`).getUTCDay();
  if (weekday === 0) return NextResponse.json({ ok: true, reportDate, status: "skipped_sunday" });

  const templates = await prisma.emailTemplate.findMany({
    where: { key: RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY, recipients: { not: "" } },
    select: { companyId: true },
    distinct: ["companyId"],
  });
  const results = [];
  for (const row of templates) {
    const lastSent = await prisma.receivableEmailSendLog.findFirst({
      where: { companyId: row.companyId, templateKey: RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY, status: "sent" },
      orderBy: { reportDate: "desc" },
      select: { reportDate: true },
    });
    if (lastSent && daysBetween(lastSent.reportDate, reportDate) < 3) {
      results.push({ companyId: row.companyId, status: "skipped_not_due", lastSent: lastSent.reportDate });
      continue;
    }
    try {
      await runReceivableOutstandingDailyEmail(row.companyId, reportDate, {
        detailKeys: [RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY],
        includeOperationsSummary: false,
      });
      await prisma.receivableEmailSendLog.create({
        data: { companyId: row.companyId, templateKey: RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY, reportDate, status: "sent" },
      });
      results.push({ companyId: row.companyId, status: "sent" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.receivableEmailSendLog.create({
        data: { companyId: row.companyId, templateKey: RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY, reportDate, status: "failed", errorSummary: message.slice(0, 1000) },
      });
      results.push({ companyId: row.companyId, status: "failed", error: message });
    }
  }
  return NextResponse.json({ ok: true, reportDate, results });
}
