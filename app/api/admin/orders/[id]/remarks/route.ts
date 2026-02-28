import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";
import type { FulfillmentStage } from "@prisma/client";

const createRemarkSchema = z.object({
  stage: z.enum([
    "order_received",
    "sample_free_issue",
    "print",
    "ready_to_dispatch",
    "dispatched",
    "invoice_complete",
    "delivery_complete",
  ]),
  type: z.enum(["internal", "external"]),
  content: trimmedString(1, LIMITS.orderRemarkContent.max),
  showOnInvoice: z.boolean().optional().default(false),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("orders.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createRemarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const remark = await prisma.orderRemark.create({
    data: {
      orderId: order.id,
      stage: parsed.data.stage as FulfillmentStage,
      type: parsed.data.type as "internal" | "external",
      content: parsed.data.content,
      showOnInvoice: parsed.data.showOnInvoice,
      addedById: auth.context!.user!.id,
    },
    select: {
      id: true,
      stage: true,
      type: true,
      content: true,
      showOnInvoice: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    ...remark,
    createdAt: remark.createdAt.toISOString(),
  });
}
