import { NextRequest, NextResponse } from "next/server";

import { clearOrderErpPeSyncFailure } from "@/lib/failed-erp-pe-sync";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("failed_webhooks.retry");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    select: { id: true, erpPeSyncError: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!order.erpPeSyncError) {
    return NextResponse.json({ error: "No failed ERP payment entry on this order" }, { status: 400 });
  }

  await clearOrderErpPeSyncFailure(order.id);
  return NextResponse.json({ ok: true, message: "Failed PE cleared — order removed from this list." });
}
