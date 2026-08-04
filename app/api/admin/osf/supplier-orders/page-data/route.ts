import { NextResponse } from "next/server";

import { ERP_PRODUCT_PRIORITY_OPTIONS } from "@/lib/product-items/erp-priority-options";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function canUseSupplierOrders(context: NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>) {
  return (
    hasPermission(context, "purchasing.osf.read") ||
    hasPermission(context, "purchasing.osf.manage") ||
    hasPermission(context, "purchasing.tools.read") ||
    hasPermission(context, "purchasing.tools.manage")
  );
}

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseSupplierOrders(context)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = context.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const vendors = await prisma.vendor.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({
    brands: vendors.map((v) => ({ id: v.id, name: v.name })),
    priorities: [...ERP_PRODUCT_PRIORITY_OPTIONS],
    companyId,
    userId: context.user.id,
  });
}
