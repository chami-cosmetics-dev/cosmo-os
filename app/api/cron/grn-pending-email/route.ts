import { NextRequest, NextResponse } from "next/server";

import { GRN_PENDING_DAILY_KEY } from "@/lib/email-templates/catalog";
import {
  getCurrentColomboReportDate,
  runGrnPendingEmailForCompany,
} from "@/lib/grn-pending-email";
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

  const reportDate = getCurrentColomboReportDate();
  const templates = await prisma.emailTemplate.findMany({
    where: {
      key: GRN_PENDING_DAILY_KEY,
      recipients: { not: "" },
    },
    select: { companyId: true },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const template of templates) {
    const result = await runGrnPendingEmailForCompany({
      companyId: template.companyId,
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
    processed: templates.length,
    sent,
    skipped,
    failed,
  });
}

