import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  isValidReportDate,
  runErpSyncFailureEmailForCompany,
} from "@/lib/erp-sync-failure-email";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const resendSchema = z.object({
  reportDate: z.string().min(1),
});

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

  const parsed = resendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const reportDate = parsed.data.reportDate.trim();
  if (!isValidReportDate(reportDate)) {
    return NextResponse.json({ error: "Invalid reportDate (YYYY-MM-DD)" }, { status: 400 });
  }

  const result = await runErpSyncFailureEmailForCompany({
    companyId,
    reportDate,
    source: "manual",
    force: true,
  });

  if (result.status === "failed") {
    return NextResponse.json(
      {
        ok: false,
        reportDate,
        error: result.errorSummary ?? "Send failed",
        orderCount: result.snapshot?.orderCount ?? 0,
        recipientCount: result.recipientCount ?? 0,
      },
      { status: 502 },
    );
  }

  if (result.status.startsWith("skipped_")) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      status: result.status,
      reportDate,
      orderCount: result.snapshot?.orderCount ?? 0,
      recipientCount: result.recipientCount ?? 0,
    });
  }

  return NextResponse.json({
    ok: true,
    reportDate,
    recipientCount: result.recipientCount ?? 0,
    orderCount: result.snapshot?.orderCount ?? 0,
  });
}
