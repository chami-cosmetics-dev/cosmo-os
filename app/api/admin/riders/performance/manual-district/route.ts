import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { normalizeShippingRuleLabelKey } from "@/lib/rider-delivery-charge";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const bodySchema = z.object({
  taskId: cuidSchema,
  labelKey: z.string().trim().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const auth = await requirePermission("riders.performance.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId;
  const userId = auth.context!.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid taskId or labelKey" }, { status: 400 });
  }

  const labelKey = normalizeShippingRuleLabelKey(parsed.data.labelKey);
  if (!labelKey) {
    return NextResponse.json({ error: "Invalid labelKey" }, { status: 400 });
  }

  const rule = await prisma.riderDeliveryChargeRule.findUnique({
    where: { labelKey },
    select: { label: true, labelKey: true, riderDeliveryCharge: true },
  });
  if (!rule) {
    return NextResponse.json({ error: "District not found in uploaded charge sheet" }, { status: 400 });
  }

  const task = await prisma.riderDeliveryTask.findFirst({
    where: {
      id: parsed.data.taskId,
      status: "completed",
      order: { companyId },
    },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Completed rider task not found" }, { status: 404 });
  }

  await prisma.riderDeliveryTask.update({
    where: { id: task.id },
    data: {
      manualIncentiveLabelKey: rule.labelKey,
      manualIncentiveLabel: rule.label,
      manualIncentiveSetAt: new Date(),
      manualIncentiveSetById: userId,
    },
  });

  return NextResponse.json({
    ok: true,
    taskId: task.id,
    labelKey: rule.labelKey,
    label: rule.label,
    incentiveAmount: rule.riderDeliveryCharge.toFixed(2),
  });
}
