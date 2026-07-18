import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import {
  getErpSyncFailureEmailConfig,
  normalizeEmailRecipientList,
  upsertErpSyncFailureEmailConfig,
} from "@/lib/erp-sync-failure-email";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { emailSchema } from "@/lib/validation";

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
  const auth = await requirePermission("settings.email_templates");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await resolveCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const config = await getErpSyncFailureEmailConfig(companyId);
  const lastSent = await prisma.erpSyncFailureEmailSendLog.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { reportDate: true, status: true, createdAt: true, source: true },
  });

  return NextResponse.json({
    enabled: config?.enabled ?? true,
    recipients: normalizeEmailRecipientList(config?.recipients),
    lastSentReportDate: lastSent?.reportDate ?? null,
    lastSendStatus: lastSent?.status ?? null,
    lastSendAt: lastSent?.createdAt?.toISOString() ?? null,
    lastSendSource: lastSent?.source ?? null,
  });
}

export async function PUT(request: NextRequest) {
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

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const recipients = normalizeEmailRecipientList(parsed.data.recipients);
  const rawItems = Array.isArray(parsed.data.recipients)
    ? parsed.data.recipients
    : String(parsed.data.recipients).split(/[\n,;]+/);
  const invalid = rawItems
    .map((s) => String(s).trim())
    .filter(Boolean)
    .filter((s) => !emailSchema.safeParse(s.toLowerCase()).success);
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Invalid email address(es): ${invalid.slice(0, 5).join(", ")}` },
      { status: 400 },
    );
  }

  await upsertErpSyncFailureEmailConfig({
    companyId,
    enabled: parsed.data.enabled,
    recipients,
  });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    action: "setting_updated",
    module: "settings",
    entityType: "ErpSyncFailureEmailConfig",
    entityId: companyId,
    summary: `Updated ERP sync failure email settings (${recipients.length} recipient(s), enabled=${parsed.data.enabled})`,
    afterData: { enabled: parsed.data.enabled, recipients },
  });

  const lastSent = await prisma.erpSyncFailureEmailSendLog.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { reportDate: true, status: true, createdAt: true, source: true },
  });

  return NextResponse.json({
    enabled: parsed.data.enabled,
    recipients,
    lastSentReportDate: lastSent?.reportDate ?? null,
    lastSendStatus: lastSent?.status ?? null,
    lastSendAt: lastSent?.createdAt?.toISOString() ?? null,
    lastSendSource: lastSent?.source ?? null,
  });
}
