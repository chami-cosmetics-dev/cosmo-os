import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import {
  getDailySalesSmsConfig,
  hasSuccessfulDailySalesSmsSend,
  normalizeRecipientList,
  upsertDailySalesSmsConfig,
} from "@/lib/daily-sales-sms";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const putSchema = z.object({
  enabled: z.boolean(),
  recipients: z.union([z.array(z.string()), z.string()]),
});

async function resolveCompanyId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET() {
  const auth = await requirePermission("settings.sms_portal");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await resolveCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const config = await getDailySalesSmsConfig(companyId);
  const lastSent = await prisma.dailySalesSmsSendLog.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { reportDate: true, status: true, createdAt: true, source: true },
  });

  return NextResponse.json({
    enabled: config?.enabled ?? true,
    recipients: normalizeRecipientList(config?.recipients),
    lastSentReportDate: lastSent?.reportDate ?? null,
    lastSendStatus: lastSent?.status ?? null,
    lastSendAt: lastSent?.createdAt?.toISOString() ?? null,
    lastSendSource: lastSent?.source ?? null,
    hasSuccessfulSendForLast: lastSent
      ? await hasSuccessfulDailySalesSmsSend(companyId, lastSent.reportDate)
      : false,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requirePermission("settings.sms_portal");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await resolveCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const recipients = normalizeRecipientList(parsed.data.recipients);
  const config = await upsertDailySalesSmsConfig({
    companyId,
    enabled: parsed.data.enabled,
    recipients,
  });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "update",
    entityType: "DailySalesSmsConfig",
    entityId: config.id,
    summary: `Updated daily sales SMS config (enabled=${parsed.data.enabled}, recipients=${recipients.length})`,
    afterData: { enabled: parsed.data.enabled, recipients },
  });

  return NextResponse.json({
    enabled: config.enabled,
    recipients,
    lastSentReportDate: null,
    lastSendStatus: null,
  });
}
