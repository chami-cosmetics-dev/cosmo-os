import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  buildGrnPendingReportSnapshot,
  getCurrentColomboReportDate,
  runGrnPendingEmailForCompany,
} from "@/lib/grn-pending-email";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const previewSchema = z.object({
  reportDate: z.string().optional(),
  sendTest: z.boolean().optional(),
});

const REPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidReportDate(value: string) {
  return REPORT_DATE_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000+05:30`).getTime());
}

async function resolveCompanyId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.email_templates");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await resolveCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const reportDateRaw = parsed.data.reportDate?.trim();
  const reportDate =
    reportDateRaw && isValidReportDate(reportDateRaw)
      ? reportDateRaw
      : getCurrentColomboReportDate();

  if (reportDateRaw && !isValidReportDate(reportDateRaw)) {
    return NextResponse.json({ error: "Invalid reportDate (YYYY-MM-DD)" }, { status: 400 });
  }

  if (parsed.data.sendTest) {
    const result = await runGrnPendingEmailForCompany({
      companyId,
      reportDate,
      source: "preview_test",
      force: true,
      isTest: true,
    });
    return NextResponse.json({
      reportDate: result.snapshot?.reportDate ?? reportDate,
      pendingCount: result.snapshot?.pendingCount ?? 0,
      rows: result.snapshot?.rows ?? [],
      subject: result.snapshot?.subject ?? null,
      sendTest: {
        ok: result.status === "sent",
        skipped: result.status.startsWith("skipped_"),
        status: result.status,
        errorSummary: result.errorSummary,
        recipientCount: result.recipientCount ?? 0,
      },
    });
  }

  const snapshot = await buildGrnPendingReportSnapshot(companyId, reportDate);
  return NextResponse.json({
    reportDate: snapshot.reportDate,
    pendingCount: snapshot.pendingCount,
    rows: snapshot.rows,
    subject: snapshot.subject,
  });
}
