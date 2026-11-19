import { NextResponse } from "next/server";
import { ITEM_CREATION_PERMISSIONS } from "@/lib/item-creation/workflow";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyPermission([ITEM_CREATION_PERMISSIONS.stores, ITEM_CREATION_PERMISSIONS.manageAll]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const companyId = auth.context!.user!.companyId;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  const deleted = await prisma.itemCreationStockReceipt.deleteMany({
    where: { id, companyId, status: "FAILED" },
  });
  if (!deleted.count) return NextResponse.json({ error: "Failed Purchase Receipt not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
