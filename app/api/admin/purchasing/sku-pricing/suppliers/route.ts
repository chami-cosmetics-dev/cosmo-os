import { NextRequest, NextResponse } from "next/server";

import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { OsfErpError } from "@/lib/osf/erp-cost-supplier";
import { mergeInstanceSupplierPurchases } from "@/lib/osf/erp-merge";
import { fetchSupplierPurchasesBySku } from "@/lib/osf/erp-purchases";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { rankSupplierOptions } from "@/lib/osf/supplier-compare";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import {
  mergeErpAndCosmoSupplierMaps,
  supplierPurchasesFromCosmoLines,
} from "@/lib/vault-osf/purchase-history-merge";
import { purchasingSkuQuerySchema } from "@/lib/validation/osf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const canTools =
    hasPermission(context, "purchasing.tools.read") ||
    hasPermission(context, "purchasing.tools.manage");
  if (!canTools) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = context.user.companyId ?? "";
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = purchasingSkuQuerySchema.safeParse({
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
    select: { name: true, code: true },
  });

  const erpInstances = await getAllOsfErpInstances(companyId);
  const purchaseSource = isVaultOsDeployment() ? "invoice" : "receipt";
  const vault = purchaseSource === "invoice";

  async function cosmoSupplierMap() {
    if (!vault) return new Map();
    const cosmoLines = await prisma.osfPurchaseHistoryLine.findMany({
      where: { companyId, sku },
      select: {
        sku: true,
        supplier: true,
        postingDate: true,
        qty: true,
        rate: true,
        netValue: true,
      },
    });
    if (cosmoLines.length === 0) return new Map();
    return supplierPurchasesFromCosmoLines(cosmoLines, sku);
  }

  if (erpInstances.length === 0) {
    const cosmoOnly = await cosmoSupplierMap();
    return NextResponse.json({
      sku,
      suppliers: rankSupplierOptions([...cosmoOnly.values()]),
      erpAvailable: true,
    });
  }

  try {
    const perInstance = await Promise.all(
      erpInstances.map((inst) =>
        fetchSupplierPurchasesBySku({
          cfg: inst.cfg,
          sku,
          // Vault: all real PI suppliers for this SKU (best/last ranking).
          allowedSuppliers: vault ? [] : suppliers,
          source: purchaseSource,
        }),
      ),
    );
    const merged = mergeInstanceSupplierPurchases(perInstance);
    const cosmo = await cosmoSupplierMap();
    const withCosmo =
      cosmo.size > 0 ? mergeErpAndCosmoSupplierMaps(merged, cosmo) : merged;
    const ranked = rankSupplierOptions([...withCosmo.values()]);
    return NextResponse.json({
      sku,
      suppliers: ranked,
      erpAvailable: true,
    });
  } catch (err) {
    if (!(err instanceof OsfErpError)) throw err;
    console.error("[purchasing sku-pricing/suppliers] ERP", err.message);
    const cosmo = await cosmoSupplierMap();
    if (cosmo.size > 0) {
      return NextResponse.json({
        sku,
        suppliers: rankSupplierOptions([...cosmo.values()]),
        erpAvailable: false,
      });
    }
    return NextResponse.json({
      sku,
      suppliers: [],
      erpAvailable: false,
      error: "Supplier history unavailable",
    });
  }
}
