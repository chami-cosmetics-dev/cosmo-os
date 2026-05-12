import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const returnActionSchema = z.object({
  actionStatus: z.enum(["pending", "solved"]),
  actionRemark: z.string().trim().max(5000).nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("returns.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid return ID" }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = returnActionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const companyId = auth.context!.user!.companyId;
  const viewerUserId = auth.context!.user!.id;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const canManage = hasPermission(auth.context!, "orders.manage");
  const existing = await prisma.orderReturn.findFirst({
    where: {
      id: parsedId.data,
      companyId,
      ...(canManage ? {} : { merchantUserId: viewerUserId }),
    },
    include: {
      order: { select: { orderNumber: true, name: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Returned order not found" }, { status: 404 });
  }

  const remark = parsed.data.actionRemark?.trim() || null;
  const updated = await prisma.orderReturn.update({
    where: { id: existing.id },
    data: {
      actionStatus: parsed.data.actionStatus,
      actionRemark: remark,
      actionDate: new Date(),
      actionById: viewerUserId,
    },
  });

  await writeAuditLog({
    companyId,
    actorUserId: viewerUserId,
    module: "orders",
    action: updated.actionStatus === "solved" ? "returned_order_solved" : "returned_order_updated",
    entityType: "OrderReturn",
    entityId: updated.id,
    summary: `Updated returned order ${existing.order.orderNumber ?? existing.order.name ?? existing.orderId}`,
    beforeData: {
      actionStatus: existing.actionStatus,
      actionRemark: existing.actionRemark,
    },
    afterData: {
      actionStatus: updated.actionStatus,
      actionRemark: updated.actionRemark,
      actionDate: updated.actionDate,
    },
  });

  return NextResponse.json({
    ok: true,
    returnedOrder: {
      id: updated.id,
      actionStatus: updated.actionStatus,
      actionRemark: updated.actionRemark,
      actionDate: updated.actionDate?.toISOString() ?? null,
    },
  });
}
