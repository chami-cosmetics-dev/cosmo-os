import { NextResponse } from "next/server";
import { retryStoreAllocationPurchaseReceipt } from "@/lib/item-creation/automation";
import { ITEM_CREATION_PERMISSIONS } from "@/lib/item-creation/workflow";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { requireStoreAllocationAccess } from "@/lib/store-allocation/auth";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireStoreAllocationAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { id } = await params;
    const purchaseReceipt = await retryStoreAllocationPurchaseReceipt(auth.context!, id);
    return NextResponse.json({ purchaseReceipt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Retry failed" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireStoreAllocationAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context!, ITEM_CREATION_PERMISSIONS.stores) && !hasPermission(auth.context!, ITEM_CREATION_PERMISSIONS.manageAll)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const deleted = await prisma.storeAllocationPurchaseReceipt.deleteMany({
    where: { id, companyId: auth.companyId, status: "FAILED" },
  });
  if (!deleted.count) return NextResponse.json({ error: "Failed Purchase Receipt not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
