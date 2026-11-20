import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreAllocationAccess } from "@/lib/store-allocation/auth";

export async function GET() {
  const auth = await requireStoreAllocationAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const rows = await prisma.storeAllocationPurchaseReceipt.findMany({
    where: { companyId: auth.companyId, status: "FAILED" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ rows });
}
