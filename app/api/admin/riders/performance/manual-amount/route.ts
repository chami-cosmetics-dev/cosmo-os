import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const bodySchema = z.object({
  taskId: cuidSchema,
  amount: z.union([z.number(), z.string()]),
});

function parseAmount(raw: number | string): Prisma.Decimal | null {
  const text = String(raw).trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = new Prisma.Decimal(text);
  if (value.lt(0) || value.gt(100000)) return null;
  return value;
}

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
    return NextResponse.json({ error: "Invalid task or amount" }, { status: 400 });
  }

  const amount = parseAmount(parsed.data.amount);
  if (!amount) {
    return NextResponse.json({ error: "Enter an amount from 0 to 100000, up to 2 decimals" }, { status: 400 });
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
      manualIncentiveAmount: amount,
      manualIncentiveLabelKey: null,
      manualIncentiveLabel: null,
      manualIncentiveSetAt: new Date(),
      manualIncentiveSetById: userId,
    },
  });

  return NextResponse.json({
    ok: true,
    taskId: task.id,
    incentiveAmount: amount.toFixed(2),
  });
}
