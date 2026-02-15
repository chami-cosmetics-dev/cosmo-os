import { NextRequest, NextResponse } from "next/server";

import { sendSms } from "@/lib/hutch-sms";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";
import { z } from "zod";

const testSmsSchema = z.object({
  phoneNumber: trimmedString(1, LIMITS.mobile.max),
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
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const config = await prisma.smsPortalConfig.findUnique({
    where: { companyId: user.companyId },
  });

  if (!config) {
    return NextResponse.json(
      { error: "Save SMS portal configuration first before testing" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = testSmsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await sendSms(
    user.companyId,
    parsed.data.phoneNumber,
    "This is a test SMS from Cosmo OS. Your SMS portal is configured correctly.",
    userId
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.message ?? "Failed to send test SMS" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
