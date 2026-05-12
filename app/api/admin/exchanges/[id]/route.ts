import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const exchangeUpdateSchema = z.object({
  status: z.enum(["pending", "solved"]),
  remark: z.string().trim().max(5000).nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("exchanges.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid exchange ID" }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = exchangeUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const companyId = auth.context!.user!.companyId;
  const viewerUserId = auth.context!.user!.id;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const canManageAll = hasPermission(auth.context!, "orders.manage");
  const existing = await prisma.orderExchange.findFirst({
    where: {
      id: parsedId.data,
      companyId,
      ...(canManageAll ? {} : { merchantUserId: viewerUserId }),
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Exchange not found" }, { status: 404 });
  }

  const updated = await prisma.orderExchange.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      remark: parsed.data.remark?.trim() || null,
      actionDate: new Date(),
      actionById: viewerUserId,
    },
  });

  await writeAuditLog({
    companyId,
    actorUserId: viewerUserId,
    module: "orders",
    action: updated.status === "solved" ? "exchange_solved" : "exchange_updated",
    entityType: "OrderExchange",
    entityId: updated.id,
    summary: `Updated exchange ${updated.originalReference} -> ${updated.replacementReference}`,
    beforeData: {
      status: existing.status,
      remark: existing.remark,
    },
    afterData: {
      status: updated.status,
      remark: updated.remark,
      actionDate: updated.actionDate,
    },
  });

  return NextResponse.json({
    ok: true,
    exchange: {
      id: updated.id,
      status: updated.status,
      remark: updated.remark,
      actionDate: updated.actionDate?.toISOString() ?? null,
    },
  });
}
