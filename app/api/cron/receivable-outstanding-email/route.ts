import { NextRequest, NextResponse } from "next/server";

import { RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY, RECEIVABLE_DELIVERY_PAYMENT_PENDING_DAILY_KEY, RECEIVABLE_NOT_DISPATCHED_DAILY_KEY, RECEIVABLE_OPERATIONS_SUMMARY_DAILY_KEY } from "@/lib/email-templates/catalog";
import { getCurrentColomboReportDate } from "@/lib/grn-pending-email";
import { runReceivableOutstandingDailyEmail } from "@/lib/receivable-outstanding-email";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) { const secret = process.env.CRON_SECRET; return !secret ? process.env.NODE_ENV !== "production" : request.headers.get("authorization") === `Bearer ${secret}`; }
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = [RECEIVABLE_DELIVERY_PAYMENT_PENDING_DAILY_KEY, RECEIVABLE_NOT_DISPATCHED_DAILY_KEY, RECEIVABLE_DELIVERY_INCOMPLETE_DAILY_KEY, RECEIVABLE_OPERATIONS_SUMMARY_DAILY_KEY];
  const templates = await prisma.emailTemplate.findMany({ where: { key: { in: keys }, recipients: { not: "" } }, select: { companyId: true }, distinct: ["companyId"] });
  const reportDate = getCurrentColomboReportDate();
  const results = [];
  for (const row of templates) { try { await runReceivableOutstandingDailyEmail(row.companyId, reportDate); results.push({ companyId: row.companyId, status: "sent" }); } catch (error) { results.push({ companyId: row.companyId, status: "failed", error: error instanceof Error ? error.message : String(error) }); } }
  return NextResponse.json({ ok: true, reportDate, results });
}
