import { NextResponse } from "next/server";
import { ITEM_CREATION_PERMISSIONS } from "@/lib/item-creation/workflow";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requireAnyPermission([ITEM_CREATION_PERMISSIONS.stores, ITEM_CREATION_PERMISSIONS.manageAll]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const companyId = auth.context!.user!.companyId;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  const rows = await prisma.itemCreationStockReceipt.findMany({
    where: { companyId, status: "FAILED" },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ rows });
}
