import { NextRequest, NextResponse } from "next/server";

import { OsfErpError } from "@/lib/osf/erp-cost-supplier";
import { mergeInstanceSupplierPurchases } from "@/lib/osf/erp-merge";
import { fetchSupplierPurchasesBySku, normalizeSupplierKey } from "@/lib/osf/erp-purchases";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { osfSupplierOrdersSuppliersQuerySchema } from "@/lib/validation/osf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function canUseSupplierOrders(context: NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>) {
  return (
    hasPermission(context, "purchasing.osf.read") ||
    hasPermission(context, "purchasing.osf.manage") ||
    hasPermission(context, "purchasing.tools.read") ||
    hasPermission(context, "purchasing.tools.manage")
  );
}

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const parsed = osfSupplierOrdersSuppliersQuerySchema.safeParse({
    sku: searchParams.get("sku") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid sku", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const sku = parsed.data.sku;

  const suppliers = await prisma.supplier.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  const lastByKey = new Map<string, string | null>();
  const erpInstances = await getAllOsfErpInstances(companyId);
  if (erpInstances.length > 0) {
    try {
      const perInstance = await Promise.all(
        erpInstances.map((inst) =>
          fetchSupplierPurchasesBySku({
            cfg: inst.cfg,
            sku,
            allowedSuppliers: suppliers.map((s) => ({ name: s.name, code: s.code })),
          }),
        ),
      );
      const merged = mergeInstanceSupplierPurchases(perInstance);
      for (const summary of merged.values()) {
        lastByKey.set(normalizeSupplierKey(summary.displayName), summary.lastDate);
        lastByKey.set(normalizeSupplierKey(summary.supplierKey), summary.lastDate);
      }
    } catch (err) {
      if (!(err instanceof OsfErpError)) throw err;
      console.error("[osf supplier-orders/suppliers] ERP", err.message);
    }
  }

  const withMeta = suppliers.map((s) => {
    const lastPurchaseAt =
      lastByKey.get(normalizeSupplierKey(s.name)) ??
      lastByKey.get(normalizeSupplierKey(s.code)) ??
      null;
    return {
      supplierId: s.id,
      supplierName: s.name,
      lastPurchaseAt,
      sortGroup: lastPurchaseAt ? ("sku_recent" as const) : ("other" as const),
    };
  });

  withMeta.sort((a, b) => {
    if (a.sortGroup !== b.sortGroup) {
      return a.sortGroup === "sku_recent" ? -1 : 1;
    }
    if (a.sortGroup === "sku_recent") {
      const da = a.lastPurchaseAt ?? "";
      const db = b.lastPurchaseAt ?? "";
      if (da !== db) return db.localeCompare(da);
    }
    return a.supplierName.localeCompare(b.supplierName, "en", { sensitivity: "base" });
  });

  return NextResponse.json({ sku, suppliers: withMeta });
}
