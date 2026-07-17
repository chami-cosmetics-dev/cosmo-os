import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getDailySalesSmsConfig,
  isValidReportDate,
  normalizeRecipientList,
  runDailySalesSmsForCompany,
} from "@/lib/daily-sales-sms";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const bodySchema = z.object({
  reportDate: z.string().min(10).max(10),
});

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  if (!user?.companyId) {
    return NextResponse.json({ error: "No company" }, { status: 400 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success || !isValidReportDate(parsed.data.reportDate)) {
    return NextResponse.json({ error: "reportDate (YYYY-MM-DD) required" }, { status: 400 });
  }

  const config = await getDailySalesSmsConfig(user.companyId);
  const recipients = normalizeRecipientList(config?.recipients);
  if (recipients.length === 0) {
    return NextResponse.json(
      { ok: false, message: "No daily sales SMS recipients configured" },
      { status: 400 },
    );
  }

  const result = await runDailySalesSmsForCompany({
    companyId: user.companyId,
    reportDate: parsed.data.reportDate,
    source: "manual",
    force: true,
    sentById: userId,
  });

  return NextResponse.json({
    ok: result.status === "sent",
    reportDate: parsed.data.reportDate,
    recipientCount: recipients.length,
    status: result.status,
    message: result.errorSummary,
  });
}

/** OGF-style GET ?reportDate= for simple button fetch */
export async function GET(request: NextRequest) {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const reportDate = request.nextUrl.searchParams.get("reportDate")?.trim() ?? "";
  if (!isValidReportDate(reportDate)) {
    return NextResponse.json({ error: "?reportDate=YYYY-MM-DD required" }, { status: 400 });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  if (!user?.companyId) {
    return NextResponse.json({ error: "No company" }, { status: 400 });
  }

  const config = await getDailySalesSmsConfig(user.companyId);
  const recipients = normalizeRecipientList(config?.recipients);
  if (recipients.length === 0) {
    return NextResponse.json(
      { ok: false, message: "No daily sales SMS recipients configured" },
      { status: 400 },
    );
  }

  const result = await runDailySalesSmsForCompany({
    companyId: user.companyId,
    reportDate,
    source: "manual",
    force: true,
    sentById: userId,
  });

  return NextResponse.json({
    ok: result.status === "sent",
    reportDate,
    recipientCount: recipients.length,
    status: result.status,
    message: result.errorSummary,
  });
}
