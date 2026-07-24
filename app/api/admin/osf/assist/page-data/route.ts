import { NextRequest, NextResponse } from "next/server";

import { osfCompletedSalesOrderWhere } from "@/lib/osf/assist-sales";
import {
  matchesPriorityFilter,
  resolveAssistWindow,
  suggestedRopFromSales,
} from "@/lib/osf/assist-window";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { fetchLastPurchaseByItem } from "@/lib/osf/erp-purchases";
import {
  fetchBinActualQty,
  getAllOsfErpInstances,
  OsfErpError,
  stockForColumn,
} from "@/lib/osf/erp-stock";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission, requirePermission } from "@/lib/rbac";
import { osfAssistPageDataQuerySchema } from "@/lib/validation/osf";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = osfAssistPageDataQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const asOfDate = parsed.data.asOfDate ?? formatAppIsoDate(new Date());
  const priorityFilter = (parsed.data.priority ?? "Top Priority").trim() || "Top Priority";
  const page = parsed.data.page;
  const limit = parsed.data.limit;
  const q = parsed.data.q?.trim() || "";

  const canManageRops = hasPermission(context, "purchasing.osf.manage");

  const columns = await resolveOsfColumns(companyId);
  const ropColumnKeys = columns
    .filter((c) => c.active && c.includeInRop)
    .map((c) => c.key);
  const stockCols = columns.filter((c) => c.active && c.includeInStock);

  const whereBase = {
    companyId,
    sku: { not: null as string | null },
    status: { not: "archived" },
    ...(q
      ? {
          OR: [
            { sku: { contains: q, mode: "insensitive" as const } },
            { productTitle: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // Load candidates then filter priority in memory (OR on two fields with exact match).
  const allItems = await prisma.productItem.findMany({
    where: whereBase,
    orderBy: [{ updatedAt: "desc" }],
    select: {
      sku: true,
      productTitle: true,
      erp1ProductPriority: true,
      erp2ProductPriority: true,
      vendor: { select: { name: true } },
    },
  });

  const filtered = allItems.filter((row) => {
    const sku = row.sku?.trim();
    if (!sku) return false;
    return matchesPriorityFilter(
      row.erp1ProductPriority,
      row.erp2ProductPriority,
      priorityFilter,
    );
  });

  // Dedupe by sku (prefer first = most recently updated)
  const bySku = new Map<string, (typeof filtered)[number]>();
  for (const row of filtered) {
    const sku = row.sku!.trim();
    if (!bySku.has(sku)) bySku.set(sku, row);
  }
  const unique = [...bySku.values()];
  const total = unique.length;
  const pageRows = unique.slice((page - 1) * limit, page * limit);
  const skus = pageRows.map((r) => r.sku!.trim());

  const stockWarnings: Array<{ source: string; message: string }> = [];
  let binMap = new Map<string, number>();
  const purchaseBySku = new Map<string, string | null>();

  const erpInstances = await getAllOsfErpInstances(companyId);
  if (erpInstances.length === 0) {
    stockWarnings.push({
      source: "ERP",
      message: "No ERP instances configured — stock and purchase dates unavailable",
    });
  } else if (skus.length > 0) {
    const warehousesByInstance = new Map<string, Set<string>>();
    for (const col of stockCols) {
      if (!col.erpnextInstanceId) continue;
      const set = warehousesByInstance.get(col.erpnextInstanceId) ?? new Set<string>();
      for (const wh of col.warehouses) set.add(wh);
      warehousesByInstance.set(col.erpnextInstanceId, set);
    }

    const recentSinceDate = (() => {
      const t = Date.parse(`${asOfDate}T00:00:00Z`) - 30 * 86_400_000;
      return new Date(t).toISOString().slice(0, 10);
    })();

    await Promise.all(
      erpInstances.map(async (inst) => {
        const whs = [...(warehousesByInstance.get(inst.id) ?? [])];
        try {
          const [bins, purchases] = await Promise.all([
            whs.length
              ? fetchBinActualQty({ cfg: inst.cfg, warehouses: whs, itemCodes: skus })
              : Promise.resolve(new Map<string, number>()),
            fetchLastPurchaseByItem({
              cfg: inst.cfg,
              itemCodes: skus,
              recentSinceDate,
            }),
          ]);
          for (const [key, qty] of bins) {
            binMap.set(key, (binMap.get(key) ?? 0) + qty);
          }
          for (const [sku, p] of purchases) {
            const date = p.date?.trim() || null;
            if (!date) continue;
            const prev = purchaseBySku.get(sku);
            if (!prev || date > prev) purchaseBySku.set(sku, date);
          }
        } catch (err) {
          const message =
            err instanceof OsfErpError
              ? err.message.slice(0, 200)
              : err instanceof Error
                ? err.message.slice(0, 200)
                : "ERP unavailable";
          stockWarnings.push({
            source: inst.label ?? inst.id,
            message,
          });
        }
      }),
    );
  }

  // Sales: one query spanning earliest window start among page rows through asOf+1
  let salesMap = new Map<string, number>();
  if (skus.length > 0) {
    let earliestStart: Date | null = null;
    let endExclusive: Date | null = null;
    for (const row of pageRows) {
      const sku = row.sku!.trim();
      const w = resolveAssistWindow({
        asOfDate,
        lastPurchaseDate: purchaseBySku.get(sku) ?? null,
      });
      if (!earliestStart || w.rangeStart < earliestStart) earliestStart = w.rangeStart;
      if (!endExclusive) endExclusive = w.rangeEndExclusive;
    }
    if (earliestStart && endExclusive) {
      // Per-SKU windows differ — fetch lines in union range then attribute per window in loop below
      // using per-sku resolveAssistWindow + filter in memory via aggregate with sku filter,
      // then re-sum using dates... Simpler: call aggregateSalesBySkuInRange per unique window,
      // or fetch all lines once and bucket per sku window.

      const lines = await prisma.orderLineItem.findMany({
        where: {
          order: osfCompletedSalesOrderWhere(companyId, earliestStart, endExclusive),
          productItem: { sku: { in: skus } },
        },
        select: {
          quantity: true,
          productItem: { select: { sku: true } },
          order: {
            select: { deliveryCompleteAt: true, invoiceCompleteAt: true },
          },
        },
      });

      const linesBySku = new Map<string, Array<{ at: Date; qty: number }>>();
      for (const line of lines) {
        const sku = line.productItem.sku?.trim();
        if (!sku) continue;
        const at = line.order.deliveryCompleteAt ?? line.order.invoiceCompleteAt;
        if (!at) continue;
        const list = linesBySku.get(sku) ?? [];
        list.push({ at, qty: line.quantity });
        linesBySku.set(sku, list);
      }

      for (const sku of skus) {
        const w = resolveAssistWindow({
          asOfDate,
          lastPurchaseDate: purchaseBySku.get(sku) ?? null,
        });
        let sum = 0;
        for (const row of linesBySku.get(sku) ?? []) {
          if (row.at >= w.rangeStart && row.at < w.rangeEndExclusive) sum += row.qty;
        }
        salesMap.set(sku, sum);
      }
    }
  }

  const ropRows =
    skus.length > 0
      ? await prisma.productOsfRop.findMany({
          where: { companyId, sku: { in: skus } },
          select: { sku: true, columnKey: true, ropQty: true },
        })
      : [];
  const ropsBySku = new Map<string, Record<string, number>>();
  for (const r of ropRows) {
    const map = ropsBySku.get(r.sku) ?? {};
    map[r.columnKey] = r.ropQty;
    ropsBySku.set(r.sku, map);
  }

  const items = pageRows.map((row) => {
    const sku = row.sku!.trim();
    const lastPurchaseDate = purchaseBySku.get(sku) ?? null;
    const window = resolveAssistWindow({ asOfDate, lastPurchaseDate });
    const salesInWindow = salesMap.get(sku) ?? 0;
    const suggestedRop = suggestedRopFromSales(salesInWindow);
    const currentRops = ropsBySku.get(sku) ?? {};

    let totalStock: number | null = 0;
    let anyStockCol = false;
    for (const col of stockCols) {
      const qty = stockForColumn(binMap, col.warehouses, sku);
      if (qty != null) {
        anyStockCol = true;
        totalStock = (totalStock ?? 0) + qty;
      }
    }
    if (!anyStockCol && stockWarnings.length > 0 && binMap.size === 0) {
      totalStock = null;
    }

    const ropValues = Object.values(currentRops);
    const currentRopSummary =
      ropValues.length === 0 ? null : Math.max(...ropValues);

    return {
      sku,
      productTitle: row.productTitle,
      brand: row.vendor?.name ?? null,
      erp1ProductPriority: row.erp1ProductPriority,
      erp2ProductPriority: row.erp2ProductPriority,
      lastPurchaseDate,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      salesInWindow,
      suggestedRop,
      totalStock,
      currentRops,
      currentRopSummary,
    };
  });

  return NextResponse.json({
    asOfDate,
    priorityFilter,
    page,
    limit,
    total,
    canManageRops,
    ropColumnKeys,
    stockWarnings,
    items,
  });
}
