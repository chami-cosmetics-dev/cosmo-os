import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  buildDailySalesReport,
  getDailySalesSmsConfig,
  getPreviousColomboReportDate,
  isValidReportDate,
  normalizeRecipientList,
  sendDailySalesSmsToRecipients,
} from "@/lib/daily-sales-sms";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const bodySchema = z.object({
  reportDate: z.string().optional(),
  sendTest: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.sms_portal");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  if (!user?.companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const reportDate = parsed.data.reportDate?.trim() || getPreviousColomboReportDate();
  if (!isValidReportDate(reportDate)) {
    return NextResponse.json({ error: "Invalid reportDate (YYYY-MM-DD)" }, { status: 400 });
  }

  const report = await buildDailySalesReport(user.companyId, reportDate);

  let sendTestResult: { ok: boolean; errorSummary?: string; skipped?: boolean } | undefined;
  if (parsed.data.sendTest) {
    const config = await getDailySalesSmsConfig(user.companyId);
    const recipients = normalizeRecipientList(config?.recipients);
    if (recipients.length === 0) {
      sendTestResult = { ok: false, skipped: true, errorSummary: "No recipients configured" };
    } else {
      const result = await sendDailySalesSmsToRecipients({
        companyId: user.companyId,
        reportDate,
        recipients,
        messageBody: report.messageBody,
        source: "preview_test",
        sentById: userId,
      });
      sendTestResult = { ok: result.ok, errorSummary: result.errorSummary };
    }
  }

  return NextResponse.json({
    reportDate: report.reportDate,
    dayValue: Math.round(report.dayValue),
    dayCount: report.dayCount,
    mtdValue: Math.round(report.mtdValue),
    dayLocations: report.dayLocations.map((l) => ({
      code: l.code,
      value: Math.round(l.value),
    })),
    locations: report.locations.map((l) => ({
      code: l.code,
      value: Math.round(l.value),
    })),
    messageBody: report.messageBody,
    sendTest: sendTestResult,
  });
}
