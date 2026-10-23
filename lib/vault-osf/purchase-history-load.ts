import "server-only";

import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { fetchItemCountriesAndBrands, OsfErpError } from "@/lib/osf/erp-cost-supplier";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import { resolveErpSlots } from "@/lib/product-items/erp-priority-sync";
import { fetchPurchaseInvoiceLinesInRange } from "@/lib/vault-osf/erp-purchases-monthly";
import {
  cosmoDbLineToRaw,
  enrichPurchaseHistoryRow,
  erpInvoiceLineToRaw,
  filterPurchaseHistoryLinesForOs,
  isPurchaseHistoryCompanyForOs,
  lookupPurchaseHistoryCatalog,
  matchesPurchaseHistoryFilters,
  mergePurchaseHistoryLines,
  overlayPurchaseHistoryCatalog,
  parsePurchaseHistoryCompanies,
  purchaseHistoryErpCompanyOptions,
  purchaseHistoryErpSlot,
  purchaseHistoryOsCompanyExtras,
  summarizePurchaseHistoryRows,
  type CatalogSellInfo,
  type PurchaseHistoryRawLine,
  type PurchaseHistoryRow,
  type PurchaseHistorySummary,
} from "@/lib/vault-osf/purchase-history-dashboard";
import type { PurchaseHistoryQuery } from "@/lib/validation/osf";

export type PurchaseHistoryLoadResult = {
  rows: PurchaseHistoryRow[];
  summary: PurchaseHistorySummary;
  erpAvailable: boolean;
  erpError: string | null;
  filterOptions: {
    brands: string[];
    suppliers: string[];
    priorities: string[];
    companies: string[];
    countries: string[];
  };
};

export async function loadPurchaseHistory(
  companyId: string,
  query: PurchaseHistoryQuery,
): Promise<PurchaseHistoryLoadResult> {
  const {
    from,
    to,
    sku,
    commonSku,
    supplier,
    brand,
    description,
    priority,
    company,
    companies,
    country,
    marginBelow,
    erpSlot,
  } = query;
  const skuQ = sku?.trim() ?? "";
  const vaultOs = isVaultOsDeployment();
  const selectedCompanies = parsePurchaseHistoryCompanies(companies ?? company).filter(
    (name) => isPurchaseHistoryCompanyForOs(name, vaultOs),
  );

  const cosmoDb = vaultOs
    ? await prisma.osfPurchaseHistoryLine.findMany({
        where: {
          companyId,
          ...(skuQ
            ? { sku: { contains: skuQ, mode: "insensitive" as const } }
            : { postingDate: { gte: from, lte: to } }),
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
      })
    : [];
  const cosmoLines = cosmoDb.map(cosmoDbLineToRaw);

  let erpInvoiceLines: PurchaseHistoryRawLine[] = [];
  let erpAvailable = true;
  let erpError: string | null = null;
  const erpInstances = await getAllOsfErpInstances(companyId);
  const slots = resolveErpSlots(erpInstances);
  if (erpInstances.length > 0) {
    const settled = await Promise.allSettled(
      erpInstances.map(async (inst) => ({
        invoices: await fetchPurchaseInvoiceLinesInRange({
          cfg: inst.cfg,
          ...(skuQ ? { itemCode: skuQ } : { bounds: { start: from, end: to } }),
        }),
        baseUrl: inst.cfg.baseUrl,
        erpSlot: purchaseHistoryErpSlot(inst.id, {
          erp1Id: slots.erp1?.id ?? null,
          erp2Id: slots.erp2?.id ?? null,
        }),
      })),
    );
    const seenInv = new Set<string>();
    const erpErrors: string[] = [];
    let anyOk = false;
    for (const result of settled) {
      if (result.status === "rejected") {
        const err = result.reason;
        if (!(err instanceof OsfErpError)) throw err;
        erpErrors.push(err.message);
        console.error("[purchase-history] ERP", err.message);
        continue;
      }
      anyOk = true;
      for (const row of result.value.invoices) {
        const converted = erpInvoiceLineToRaw(row, result.value.baseUrl, {
          erpSlot: result.value.erpSlot,
        });
        if (!converted) continue;
        const dedupe = `${converted.sourceRef ?? ""}|${converted.sku}|${converted.postingDate}|${converted.company ?? ""}|${converted.erpSlot ?? ""}`;
        if (seenInv.has(dedupe)) continue;
        seenInv.add(dedupe);
        erpInvoiceLines.push(converted);
      }
    }
    erpAvailable = anyOk;
    erpError = erpErrors.length > 0 ? erpErrors.join(" · ") : null;
  }

  const merged = filterPurchaseHistoryLinesForOs(
    mergePurchaseHistoryLines(cosmoLines, erpInvoiceLines),
    vaultOs,
  );
  const skus = [...new Set(merged.map((l) => l.sku))];
  const skuVariants = [
    ...new Set(
      skus.flatMap((sku) => {
        const raw = sku.trim();
        if (!raw) return [];
        return [raw, raw.toUpperCase(), raw.toLowerCase()];
      }),
    ),
  ];
  const products =
    skuVariants.length === 0
      ? []
      : await prisma.productItem.findMany({
          where: { companyId, sku: { in: skuVariants } },
          select: {
            sku: true,
            productTitle: true,
            price: true,
            compareAtPrice: true,
            erp1ProductPriority: true,
            erp2ProductPriority: true,
            vendor: { select: { name: true } },
          },
        });

  const { countryBySku, brandBySku } = await fetchItemCountriesAndBrands({
    instances: erpInstances,
    itemCodes: skuVariants.length > 0 ? skuVariants : skus,
  });

  const catalogBySku = new Map<string, CatalogSellInfo>();
  for (const p of products) {
    const code = p.sku?.trim();
    if (!code || catalogBySku.has(code)) continue;
    const info: CatalogSellInfo = {
      productTitle: p.productTitle,
      brand: p.vendor?.name ?? null,
      priority: p.erp1ProductPriority?.trim() || p.erp2ProductPriority?.trim() || null,
      country: lookupPurchaseHistoryCatalog(countryBySku, code) ?? null,
      mrp: p.compareAtPrice != null ? Number(p.compareAtPrice) : null,
      discountedPrice: p.price != null ? Number(p.price) : null,
    };
    catalogBySku.set(code, info);
    const norm = code.toUpperCase();
    if (norm && !catalogBySku.has(norm)) catalogBySku.set(norm, info);
  }
  for (const code of skus) {
    const overlaid = overlayPurchaseHistoryCatalog(lookupPurchaseHistoryCatalog(catalogBySku, code), {
      brand: lookupPurchaseHistoryCatalog(brandBySku, code) ?? null,
      country: lookupPurchaseHistoryCatalog(countryBySku, code) ?? null,
    });
    if (!overlaid) continue;
    catalogBySku.set(code, overlaid);
    const norm = code.trim().toUpperCase();
    if (norm) catalogBySku.set(norm, overlaid);
  }

  const filters = {
    from,
    to,
    sku,
    commonSku,
    supplier,
    brand,
    description,
    priority,
    companies: selectedCompanies,
    country,
    marginBelow,
    erpSlot,
  };
  const filtered = merged.filter((line) =>
    matchesPurchaseHistoryFilters(
      line,
      lookupPurchaseHistoryCatalog(catalogBySku, line.sku),
      filters,
    ),
  );
  const rows = filtered.map((line) =>
    enrichPurchaseHistoryRow(line, lookupPurchaseHistoryCatalog(catalogBySku, line.sku)),
  );
  const summary = summarizePurchaseHistoryRows(rows);

  const brandSet = new Set<string>();
  const supplierSet = new Set<string>();
  const prioritySet = new Set<string>();
  const countrySet = new Set<string>();
  for (const country of countryBySku.values()) {
    if (country.trim()) countrySet.add(country.trim());
  }
  for (const row of rows) {
    if (row.brand?.trim()) brandSet.add(row.brand.trim());
    if (row.supplier.trim()) supplierSet.add(row.supplier.trim());
    if (row.priority?.trim()) prioritySet.add(row.priority.trim());
  }

  return {
    rows,
    summary,
    erpAvailable,
    erpError,
    filterOptions: {
      brands: [...brandSet].sort((a, b) => a.localeCompare(b)),
      suppliers: [...supplierSet].sort((a, b) => a.localeCompare(b)),
      priorities: [...prioritySet].sort((a, b) => a.localeCompare(b)),
      companies: purchaseHistoryErpCompanyOptions(
        erpInvoiceLines.map((line) => line.company),
        purchaseHistoryOsCompanyExtras(vaultOs),
        vaultOs,
      ),
      countries: [...countrySet].sort((a, b) => a.localeCompare(b)),
    },
  };
}
