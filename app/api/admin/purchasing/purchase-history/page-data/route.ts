import { NextRequest, NextResponse } from "next/server";

import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { OsfErpError } from "@/lib/osf/erp-cost-supplier";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import {
  cosmoDbLineToRaw,
  enrichPurchaseHistoryRow,
  erpInvoiceLineToRaw,
  matchesPurchaseHistoryFilters,
  mergePurchaseHistoryLines,
  paginateRows,
  summarizePurchaseHistoryRows,
  type CatalogSellInfo,
  type PurchaseHistoryRawLine,
} from "@/lib/vault-osf/purchase-history-dashboard";
import { fetchPurchaseInvoiceLinesInRange } from "@/lib/vault-osf/erp-purchases-monthly";
import { purchaseHistoryQuerySchema } from "@/lib/validation/osf";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  if (!isVaultOsDeployment()) {
    return NextResponse.json(
      { error: "Purchase history dashboard is Vault OS only", code: "VAULT_ONLY" },
      { status: 409 },
    );
  }
  const companyId = context.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = purchaseHistoryQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { from, to, sku, supplier, brand, offset, limit } = parsed.data;
  if (from > to) {
    return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
  }

  const cosmoDb = await prisma.osfPurchaseHistoryLine.findMany({
    where: {
      companyId,
      postingDate: { gte: from, lte: to },
      ...(sku?.trim()
        ? { sku: { contains: sku.trim(), mode: "insensitive" as const } }
        : {}),
      ...(supplier?.trim()
        ? { supplier: { contains: supplier.trim(), mode: "insensitive" as const } }
        : {}),
    },
    select: {
      sku: true,
      supplier: true,
      postingDate: true,
      qty: true,
      rate: true,
      netValue: true,
      sourceRef: true,
      excelCompany: true,
    },
  });
  const cosmoLines = cosmoDb.map(cosmoDbLineToRaw);

  let erpLines: PurchaseHistoryRawLine[] = [];
  let erpAvailable = true;
  let erpError: string | null = null;
  const erpInstances = await getAllOsfErpInstances(companyId);
  try {
    if (erpInstances.length > 0) {
      const batches = await Promise.all(
        erpInstances.map((inst) =>
          fetchPurchaseInvoiceLinesInRange({
            cfg: inst.cfg,
            bounds: { start: from, end: to },
          }),
        ),
      );
      const seen = new Set<string>();
      for (const batch of batches) {
        for (const row of batch) {
          const converted = erpInvoiceLineToRaw(row);
          if (!converted) continue;
          const dedupe = `${converted.sourceRef ?? ""}|${converted.sku}|${converted.postingDate}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          erpLines.push(converted);
        }
      }
    }
  } catch (err) {
    if (!(err instanceof OsfErpError)) throw err;
    erpAvailable = false;
    erpError = err.message;
    console.error("[purchase-history page-data] ERP", err.message);
  }

  const merged = mergePurchaseHistoryLines(cosmoLines, erpLines);
  const skus = [...new Set(merged.map((l) => l.sku))];
  const products =
    skus.length === 0
      ? []
      : await prisma.productItem.findMany({
          where: { companyId, sku: { in: skus } },
          select: {
            sku: true,
            productTitle: true,
            price: true,
            compareAtPrice: true,
            vendor: { select: { name: true } },
          },
        });

  const catalogBySku = new Map<string, CatalogSellInfo>();
  for (const p of products) {
    const code = p.sku?.trim();
    if (!code || catalogBySku.has(code)) continue;
    catalogBySku.set(code, {
      productTitle: p.productTitle,
      brand: p.vendor?.name ?? null,
      mrp: p.compareAtPrice != null ? Number(p.compareAtPrice) : null,
      discountedPrice: p.price != null ? Number(p.price) : null,
    });
  }

  const filters = { from, to, sku, supplier, brand };
  const filtered = merged.filter((line) =>
    matchesPurchaseHistoryFilters(line, catalogBySku.get(line.sku), filters),
  );
  const enriched = filtered.map((line) =>
    enrichPurchaseHistoryRow(line, catalogBySku.get(line.sku)),
  );
  const summary = summarizePurchaseHistoryRows(enriched);
  const page = paginateRows(enriched, offset, limit);

  const brandSet = new Set<string>();
  const supplierSet = new Set<string>();
  for (const row of enriched) {
    if (row.brand?.trim()) brandSet.add(row.brand.trim());
    if (row.supplier.trim()) supplierSet.add(row.supplier.trim());
  }

  return NextResponse.json({
    rows: page,
    summary,
    total: enriched.length,
    offset,
    limit,
    erpAvailable,
    erpError,
    filterOptions: {
      brands: [...brandSet].sort((a, b) => a.localeCompare(b)),
      suppliers: [...supplierSet].sort((a, b) => a.localeCompare(b)),
    },
  });
}
