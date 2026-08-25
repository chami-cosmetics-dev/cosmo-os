import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("products.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsedId = cuidSchema.safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existing = await prisma.nmrApprovedItemCode.findFirst({
    where: { id: parsedId.data, companyId },
    select: { id: true, itemCode: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "NMRA-approved item not found" }, { status: 404 });
  }

  await prisma.nmrApprovedItemCode.delete({ where: { id: existing.id } });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "products",
    action: "setting_deleted",
    entityType: "NmrApprovedItemCode",
    entityId: existing.id,
    summary: `Removed NMRA-approved item ${existing.itemCode}`,
    beforeData: { itemCode: existing.itemCode },
  });

  return NextResponse.json({ success: true });
}
