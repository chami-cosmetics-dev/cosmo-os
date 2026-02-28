import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

const updateRemarkSchema = z.object({
  content: trimmedString(1, LIMITS.orderRemarkContent.max),
  showOnInvoice: z.boolean(),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

async function getRemarkWithOrder(orderId: string, remarkId: string, companyId: string) {
  return prisma.orderRemark.findFirst({
    where: {
      id: remarkId,
      orderId,
      order: { companyId },
    },
    include: { order: true },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; remarkId: string }> }
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

  const { id, remarkId } = await params;
  const orderIdResult = cuidSchema.safeParse(id);
  const remarkIdResult = cuidSchema.safeParse(remarkId);
  if (!orderIdResult.success || !remarkIdResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const remark = await getRemarkWithOrder(orderIdResult.data, remarkIdResult.data, companyId);
  if (!remark) {
    return NextResponse.json({ error: "Remark not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateRemarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await prisma.orderRemark.update({
    where: { id: remark.id },
    data: {
      content: parsed.data.content,
      showOnInvoice: parsed.data.showOnInvoice,
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
    ...updated,
    createdAt: updated.createdAt.toISOString(),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; remarkId: string }> }
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

  const { id, remarkId } = await params;
  const orderIdResult = cuidSchema.safeParse(id);
  const remarkIdResult = cuidSchema.safeParse(remarkId);
  if (!orderIdResult.success || !remarkIdResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const remark = await getRemarkWithOrder(orderIdResult.data, remarkIdResult.data, companyId);
  if (!remark) {
    return NextResponse.json({ error: "Remark not found" }, { status: 404 });
  }

  await prisma.orderRemark.delete({
    where: { id: remark.id },
  });

  return NextResponse.json({ success: true });
}
