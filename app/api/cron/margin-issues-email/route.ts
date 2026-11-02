import { NextRequest, NextResponse } from "next/server";

import { MARGIN_ISSUES_DAILY_KEY } from "@/lib/email-templates/catalog";
import { getCurrentColomboReportDate } from "@/lib/grn-pending-email";
import { runMarginIssuesDailyEmail } from "@/lib/margin-issues-email";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !secret ? process.env.NODE_ENV !== "production" : request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const preview = request.nextUrl.searchParams.get("preview") === "1";
  const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim();
  const companies = requestedCompanyId
    ? [{ companyId: requestedCompanyId }]
    : await prisma.emailTemplate.findMany({ where: { key: MARGIN_ISSUES_DAILY_KEY, recipients: { not: "" } }, select: { companyId: true }, distinct: ["companyId"] });
  const reportDate = getCurrentColomboReportDate();
  const results = [];
  for (const row of companies) {
    try {
      results.push(await runMarginIssuesDailyEmail({ companyId: row.companyId, reportDate, preview }));
    } catch (error) {
      results.push({ companyId: row.companyId, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  return NextResponse.json({ ok: results.every((result) => result.status !== "failed"), reportDate, results });
}
