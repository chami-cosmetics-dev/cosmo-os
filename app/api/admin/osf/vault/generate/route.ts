import { NextRequest, NextResponse } from "next/server";

import { formatAppIsoDate } from "@/lib/format-datetime";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { fetchBinActualQty, getAllOsfErpInstances, OsfErpError } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import { resolveErpSlots } from "@/lib/product-items/erp-priority-sync";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { attachOsPriority, fetchVaultCatalog } from "@/lib/vault-osf/catalog";
import { isVaultOsfConfigured, resolveVaultBusinessUnits, vaultOsfNotConfiguredMessage } from "@/lib/vault-osf/columns";
import { buildVaultOsfWorkbookBuffer } from "@/lib/vault-osf/build-workbook";
import { fetchLatestPurchases, fetchMonthlyPurchases, mergePurchaseMaps } from "@/lib/vault-osf/erp-purchases-monthly";
import { fetchVaultPrices } from "@/lib/vault-osf/erp-pricing";
import { fetchSalesMonth, salesQtyForSku } from "@/lib/vault-osf/erp-sales";
import { monthKeysInWindow, monthPostingBounds, reportingAprilStart } from "@/lib/vault-osf/months";
import type { PurchaseCell, SalesCell } from "@/lib/vault-osf/types";
import { vaultOsfGenerateBodySchema } from "@/lib/validation/osf";

export const maxDuration = 300;

function todayColombo(): string {
  return formatAppIsoDate(new Date());
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = vaultOsfGenerateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const asOfDate = parsed.data.asOfDate ?? todayColombo();
  const columns = await resolveOsfColumns(companyId);
  if (!isVaultOsfConfigured(columns)) {
    return NextResponse.json(
      {
        error: "Vault OSF is not configured",
        code: "VAULT_OSF_NOT_CONFIGURED",
        detail: "Seed SV / ORI / AE columns with erpCompany first.",
      },
      { status: 409 },
    );
  }

  const units = resolveVaultBusinessUnits(columns);
  const notReady = vaultOsfNotConfiguredMessage(units);
  if (notReady) {
    return NextResponse.json(
      { error: notReady, code: "VAULT_OSF_NOT_CONFIGURED" },
      { status: 409 },
    );
  }

  const erpInstances = await getAllOsfErpInstances(companyId);
  if (erpInstances.length === 0) {
    return NextResponse.json(
      {
        error: "ERP credentials missing",
        code: "ERP_UNAVAILABLE",
        detail: "Configure ERP1 and ERP2 for this company.",
      },
      { status: 502 },
    );
  }

  const instById = new Map(erpInstances.map((i) => [i.id, i]));
  const slots = resolveErpSlots(erpInstances);
  const erp1 = slots.erp1 ? instById.get(slots.erp1.id) : erpInstances[0];
  if (!erp1) {
    return NextResponse.json(
      { error: "ERP1 unreachable", code: "ERP_UNAVAILABLE", detail: "ERP1 instance missing." },
      { status: 502 },
    );
  }

  try {
    const [catalogRaw, ropRows, historyRows, allowedSuppliers] = await Promise.all([
      fetchVaultCatalog(erp1.cfg),
      prisma.productOsfRop.findMany({ where: { companyId } }),
      prisma.osfMonthlySalesHistory.findMany({ where: { companyId } }),
      prisma.supplier.findMany({ where: { companyId }, select: { name: true, code: true } }),
    ]);
    const catalog = await attachOsPriority(companyId, catalogRaw);
    const skus = catalog.map((c) => c.sku);

    const warehousesByInstance = new Map<string, Set<string>>();
    for (const u of units) {
      const set = warehousesByInstance.get(u.erpInstanceId) ?? new Set<string>();
      for (const wh of u.warehouses) set.add(wh);
      warehousesByInstance.set(u.erpInstanceId, set);
    }

    const months = monthKeysInWindow(asOfDate);
    const sales = new Map<string, Record<string, Record<string, SalesCell>>>();
    const purchases = new Map<string, Record<string, PurchaseCell>>();

    const setSale = (sku: string, month: string, key: string, cell: SalesCell) => {
      let byMonth = sales.get(sku);
      if (!byMonth) {
        byMonth = {};
        sales.set(sku, byMonth);
      }
      if (!byMonth[month]) byMonth[month] = {};
      byMonth[month][key] = cell;
    };

    for (const month of months) {
      const bounds = monthPostingBounds(month, asOfDate);
      const monthPurch = new Map<string, PurchaseCell>();
      await Promise.all(
        units.map(async (u) => {
          const inst = instById.get(u.erpInstanceId);
          if (!inst) {
            throw new OsfErpError(`Missing ERP instance for ${u.label}`);
          }
          const [activity, purchMap] = await Promise.all([
            fetchSalesMonth({ cfg: inst.cfg, erpCompany: u.erpCompany, bounds }),
            fetchMonthlyPurchases({
              cfg: inst.cfg,
              erpCompany: u.erpCompany,
              bounds,
              allowedSuppliers,
            }),
          ]);
          for (const sku of skus) {
            const qty = salesQtyForSku(activity, sku);
            setSale(sku, month, u.key, {
              qty,
              source: qty == null ? null : "erp",
            });
          }
          mergePurchaseMaps(monthPurch, purchMap);
        }),
      );
      for (const sku of skus) {
        const cell = monthPurch.get(sku);
        if (!cell) continue;
        const byMonth = purchases.get(sku) ?? {};
        byMonth[month] = cell;
        purchases.set(sku, byMonth);
      }
    }

    for (const h of historyRows) {
      const existing = sales.get(h.sku)?.[h.month]?.[h.columnKey];
      if (existing?.qty != null) continue;
      setSale(h.sku, h.month, h.columnKey, { qty: h.qty, source: "import" });
    }

    const rops = new Map<string, Record<string, number>>();
    for (const r of ropRows) {
      const entry = rops.get(r.sku) ?? {};
      entry[r.columnKey] = r.ropQty;
      rops.set(r.sku, entry);
    }

    const binChunks = await Promise.all(
      [...warehousesByInstance.entries()].map(async ([id, whs]) => {
        const inst = instById.get(id);
        if (!inst) throw new OsfErpError(`Missing ERP instance ${id}`);
        return fetchBinActualQty({ cfg: inst.cfg, warehouses: [...whs], itemCodes: skus });
      }),
    );
    const binMap = new Map<string, number>();
    for (const chunk of binChunks) {
      for (const [k, v] of chunk) binMap.set(k, v);
    }

    let latest = new Map<string, { rate: number | null; supplier: string | null; date: string | null }>();
    for (const inst of erpInstances) {
      latest = await fetchLatestPurchases({
        cfg: inst.cfg,
        allowedSuppliers,
        existing: latest,
      });
    }

    const prices = await fetchVaultPrices(erp1.cfg, skus, asOfDate);

    const buffer = await buildVaultOsfWorkbookBuffer({
      catalog,
      units,
      asOfDate,
      binMap,
      sales,
      purchases,
      prices,
      latest,
      rops,
    });

    const filename = `OSF-vault-${asOfDate}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-OSF-Row-Count": String(catalog.length),
        "X-OSF-Sales-From": reportingAprilStart(asOfDate),
        "X-OSF-Sales-To": asOfDate,
      },
    });
  } catch (err) {
    if (err instanceof OsfErpError) {
      return NextResponse.json(
        { error: "ERP unreachable", code: "ERP_UNAVAILABLE", detail: err.message },
        { status: 502 },
      );
    }
    console.error("[vault OSF generate]", err);
    return NextResponse.json({ error: "Failed to generate Vault OSF" }, { status: 500 });
  }
}
