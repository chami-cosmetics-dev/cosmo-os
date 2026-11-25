import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  getLoyaltySmsOfficePhone,
  upsertLoyaltySmsOfficePhone,
} from "@/lib/sms-templates/loyalty-sms-config";
import { LIMITS, trimmedString } from "@/lib/validation";

const putSchema = z.object({
  officeContactPhone: trimmedString(0, LIMITS.loyaltySmsOfficePhone.max),
});

async function companyIdForUser(userId: string): Promise<string | null> {
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

  const companyId = await companyIdForUser(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const officeContactPhone = await getLoyaltySmsOfficePhone(companyId);
  return NextResponse.json({ officeContactPhone });
}

export async function PUT(request: NextRequest) {
  const auth = await requirePermission("settings.sms_portal");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await companyIdForUser(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const officeContactPhone = await upsertLoyaltySmsOfficePhone(
    companyId,
    parsed.data.officeContactPhone,
  );

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "setting_updated",
    entityType: "LoyaltySmsConfig",
    entityId: companyId,
    summary: "Updated loyalty SMS office contact phone",
    afterData: { officeContactPhone },
  });

  return NextResponse.json({ officeContactPhone });
}
