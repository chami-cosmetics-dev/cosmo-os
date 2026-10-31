import "server-only";

import { fetchErpProductPriorities, normalizeSkuKey } from "@/lib/product-items/erp-priority-sync";
import { prisma } from "@/lib/prisma";
import { sellingMargin } from "@/lib/osf/pricing-math";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { fetchLatestPurchases } from "@/lib/vault-osf/erp-purchases-monthly";
import type { AllowedSupplier } from "@/lib/osf/erp-purchases";
import { fetchStockBalancesByItem } from "@/lib/stock-price-missing/scan";
import { fetchItemBrandsBySku, fetchItemPricesForList } from "@/lib/stock-price-missing/erp-selling-prices";
import { STANDARD_SELLING_PRICE_LIST } from "@/lib/sticker-lwk-erp-price-list";

export const MARGIN_DISCOUNTS = [0, 5, 10, 15, 20, 25] as const;

export type MarginBucket = {
  key: string;
  label: string;
  min: number;
  max: number | null;
};

export const MARGIN_BUCKETS: MarginBucket[] = [
  { key: "0-20", label: "0-20%", min: -Infinity, max: 20 },
  { key: "20-25", label: "20-25%", min: 20, max: 25 },
  { key: "25-30", label: "25-30%", min: 25, max: 30 },
  { key: "30-35", label: "30-35%", min: 30, max: 35 },
  { key: "35-40", label: "35-40%", min: 35, max: 40 },
  { key: "40-plus", label: "40%+", min: 40, max: null },
];

export type DiscountOutcome = "Loss" | "Break-even" | "Profit <5%" | "Profit 5-10%" | "Profit 10%+";
export type DiscountCounts = Record<DiscountOutcome, number>;

export type MarginIssueSku = {
  sku: string;
  priority: string;
  brand: string;
  latestPurchasePrice: number;
  latestPurchaseSupplier: string | null;
  latestPurchaseDate: string | null;
  standardSellingPrice: number | null;
  marginPct: number | null;
  marginBucket: string;
  /** Net current balance across every warehouse and configured ERP instance. */
  stockAvailable: number;
  /** Total configured ROP across all active ROP columns/companies. */
  totalRop: number;
  discountOutcomes: Partial<Record<number, DiscountOutcome>>;
};

export type MarginIssueSummaryRow = {
  label: string;
  groupKey: string;
  isGroup: boolean;
  margin: string;
  numberOfSkus: number;
  stockAvailable: number;
  brands: string;
  discountCounts: Record<number, DiscountCounts>;
};

export type MarginIssuesReport = {
  companyId: string;
  reportDate: string;
  details: MarginIssueSku[];
  summary: MarginIssueSummaryRow[];
  total: MarginIssueSummaryRow;
  ropFulfillment: RopFulfillmentReport;
};

export const ROP_FULFILLMENT_BANDS = [
  { key: "0-10", label: "High risk 0-10%" },
  { key: "10-30", label: "Below 30%" },
  { key: "30-50", label: "30-50%" },
  { key: "50-plus", label: "Above 50%" },
] as const;

export type RopFulfillmentBandKey = (typeof ROP_FULFILLMENT_BANDS)[number]["key"];

export type RopFulfillmentSummaryRow = {
  priority: string;
  counts: Record<RopFulfillmentBandKey, number>;
};

export type RopFulfillmentReport = {
  rows: RopFulfillmentSummaryRow[];
  total: RopFulfillmentSummaryRow;
};

const OUTCOMES: DiscountOutcome[] = ["Loss", "Break-even", "Profit <5%", "Profit 5-10%", "Profit 10%+"];
const PRIORITY_ORDER = ["Discontinue", "Low", "Newly added", "Top"];

function emptyDiscountCounts(): DiscountCounts {
  return { Loss: 0, "Break-even": 0, "Profit <5%": 0, "Profit 5-10%": 0, "Profit 10%+": 0 };
}

function emptyDiscountMap(): Record<number, DiscountCounts> {
  return Object.fromEntries(MARGIN_DISCOUNTS.map((discount) => [discount, emptyDiscountCounts()])) as Record<number, DiscountCounts>;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function classifyDiscountOutcome(selling: number, cost: number): DiscountOutcome {
  if (selling <= cost + 0.000001) return selling < cost - 0.000001 ? "Loss" : "Break-even";
  const margin = sellingMargin(selling, cost) ?? 0;
  if (margin < 0.05) return "Profit <5%";
  if (margin < 0.1) return "Profit 5-10%";
  return "Profit 10%+";
}

export function marginBucketForPercent(marginPct: number): MarginBucket {
  return MARGIN_BUCKETS.find((bucket) => marginPct >= bucket.min && (bucket.max == null || marginPct < bucket.max)) ?? MARGIN_BUCKETS[0]!;
}

export function discountOutcomeCounts(rows: MarginIssueSku[]): Record<number, DiscountCounts> {
  const output = emptyDiscountMap();
  for (const row of rows) {
    for (const discount of MARGIN_DISCOUNTS) {
      const outcome = row.discountOutcomes[discount];
      if (outcome) output[discount][outcome] += 1;
    }
  }
  return output;
}

function summaryRow(label: string, rows: MarginIssueSku[], groupKey: string, isGroup: boolean, margin: string, includeDiscounts = true): MarginIssueSummaryRow {
  const brands = [...new Set(rows.map((row) => normalizeText(row.brand)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    label,
    groupKey,
    isGroup,
    margin,
    numberOfSkus: rows.length,
    stockAvailable: rows.reduce((sum, row) => sum + row.stockAvailable, 0),
    brands: brands.join(", "),
    discountCounts: includeDiscounts ? discountOutcomeCounts(rows) : emptyDiscountMap(),
  };
}

function priorityRank(priority: string): number {
  const index = PRIORITY_ORDER.findIndex((value) => value.toLowerCase() === priority.toLowerCase());
  return index >= 0 ? index : PRIORITY_ORDER.length;
}

function emptyRopCounts(): Record<RopFulfillmentBandKey, number> {
  return Object.fromEntries(ROP_FULFILLMENT_BANDS.map((band) => [band.key, 0])) as Record<RopFulfillmentBandKey, number>;
}

export function ropFulfillmentBand(stock: number, rop: number): RopFulfillmentBandKey | null {
  if (!Number.isFinite(stock) || !Number.isFinite(rop) || rop <= 0) return null;
  const stockPercent = (stock / rop) * 100;
  if (stockPercent <= 10) return "0-10";
  if (stockPercent <= 30) return "10-30";
  if (stockPercent <= 50) return "30-50";
  return "50-plus";
}

function buildRopFulfillmentReport(rows: Array<{ priority: string; stock: number; rop: number }>): RopFulfillmentReport {
  const byPriority = new Map<string, Record<RopFulfillmentBandKey, number>>();
  for (const row of rows) {
    const band = ropFulfillmentBand(row.stock, row.rop);
    if (!band) continue;
    const counts = byPriority.get(row.priority) ?? emptyRopCounts();
    counts[band] += 1;
    byPriority.set(row.priority, counts);
  }

  const priorities = [...byPriority.keys()].sort((a, b) => priorityRank(a) - priorityRank(b) || a.localeCompare(b));
  const summaryRows = priorities.map((priority) => ({ priority, counts: byPriority.get(priority)! }));
  const totalCounts = emptyRopCounts();
  for (const row of summaryRows) {
    for (const band of ROP_FULFILLMENT_BANDS) totalCounts[band.key] += row.counts[band.key];
  }
  return { rows: summaryRows, total: { priority: "Total", counts: totalCounts } };
}

export function buildMarginIssueSummary(details: MarginIssueSku[]): { summary: MarginIssueSummaryRow[]; total: MarginIssueSummaryRow } {
  const rows: MarginIssueSummaryRow[] = [];
  for (const bucket of MARGIN_BUCKETS) {
    const bucketRows = details.filter((row) => row.marginBucket === bucket.key);
    if (bucketRows.length === 0) continue;
    rows.push(summaryRow(bucket.label, bucketRows, bucket.key, true, bucket.label));
    const priorities = [...new Set(bucketRows.map((row) => row.priority))].sort((a, b) => priorityRank(a) - priorityRank(b) || a.localeCompare(b));
    for (const priority of priorities) {
      rows.push(summaryRow(`  ${priority}`, bucketRows.filter((row) => row.priority === priority), bucket.key, false, bucket.label, false));
    }
  }
  const missingPriceRows = details.filter((row) => row.marginBucket === "missing-standard-price");
  if (missingPriceRows.length > 0) {
    rows.push(summaryRow("Missing Standard Selling Price", missingPriceRows, "missing-standard-price", true, "Unavailable", false));
    const priorities = [...new Set(missingPriceRows.map((row) => row.priority))].sort((a, b) => priorityRank(a) - priorityRank(b) || a.localeCompare(b));
    for (const priority of priorities) {
      rows.push(summaryRow(`  ${priority}`, missingPriceRows.filter((row) => row.priority === priority), "missing-standard-price", false, "Unavailable", false));
    }
  }
  return { summary: rows, total: summaryRow("Grand Total", details, "grand-total", true, "All margins") };
}

function mergeLatestPurchase(target: Map<string, { sku: string; rate: number; date: string | null; sourceIndex: number }>, sku: string, rate: number, date: string | null, sourceIndex: number) {
  const key = normalizeSkuKey(sku);
  if (!key) return;
  const previous = target.get(key);
  if (!previous || (date != null && (previous.date == null || date > previous.date))) target.set(key, { sku: sku.trim(), rate, date, sourceIndex });
}

export async function loadMarginIssuesReport(companyId: string, reportDate: string): Promise<MarginIssuesReport> {
  const [instances, allowedSuppliers, locations, ropColumns] = await Promise.all([
    getAllOsfErpInstances(companyId),
    prisma.supplier.findMany({ where: { companyId }, select: { name: true, code: true } }),
    prisma.companyLocation.findMany({ where: { companyId, supplierPrefix: { not: null } }, select: { supplierPrefix: true } }),
    resolveOsfColumns(companyId),
  ]);
  if (instances.length === 0) throw new Error("No configured ERP instances are available for margin issues report");

  const supplierList: AllowedSupplier[] = allowedSuppliers.map((supplier) => ({ name: supplier.name, code: supplier.code }));
  const intercompanyPrefixes = locations.map((location) => location.supplierPrefix?.trim()).filter((prefix): prefix is string => Boolean(prefix));
  const sources = await Promise.all(instances.map(async (instance, sourceIndex) => {
    const latest = await fetchLatestPurchases({ cfg: instance.cfg, allowedSuppliers: supplierList, intercompanyPrefixes });
    const skus = [...latest.keys()];
    const [prices, brands, priorities, stock] = await Promise.all([
      fetchItemPricesForList(instance.cfg, STANDARD_SELLING_PRICE_LIST),
      fetchItemBrandsBySku(instance.cfg, skus),
      fetchErpProductPriorities(instance.cfg).catch(() => ({ bySku: new Map<string, string | null>() })),
      fetchStockBalancesByItem(instance.cfg),
    ]);
    return { sourceIndex, latest, prices, brands, priorities: priorities.bySku, stock };
  }));

  const latestBySku = new Map<string, { sku: string; rate: number; date: string | null; sourceIndex: number }>();
  for (const source of sources) {
    for (const [sku, purchase] of source.latest) {
      if (purchase.rate == null) continue;
      mergeLatestPurchase(latestBySku, sku, purchase.rate, purchase.date, source.sourceIndex);
    }
  }

  const products = latestBySku.size === 0 ? [] : await prisma.productItem.findMany({
    where: { companyId, sku: { in: [...latestBySku.values()].map((row) => row.sku) } },
    select: { sku: true, erp1ProductPriority: true, erp2ProductPriority: true, vendor: { select: { name: true } } },
  });
  const productBySku = new Map(products.map((product) => [normalizeSkuKey(product.sku), product]));
  const totalStockBySku = new Map<string, number>();
  for (const source of sources) {
    for (const [sku, quantity] of source.stock) {
      const skuKey = normalizeSkuKey(sku);
      if (!skuKey || !Number.isFinite(quantity)) continue;
      totalStockBySku.set(skuKey, (totalStockBySku.get(skuKey) ?? 0) + quantity);
    }
  }
  const details: MarginIssueSku[] = [];
  const priorityBySku = new Map<string, string>();

  for (const [skuKey, latest] of latestBySku) {
    const source = sources[latest.sourceIndex];
    if (!source) continue;
    const preferredPrice = source.prices[latest.sku] ?? Object.entries(source.prices).find(([key]) => normalizeSkuKey(key) === skuKey)?.[1];
    const standard = Number(preferredPrice ?? sources.map((item) => item.prices[latest.sku] ?? Object.entries(item.prices).find(([key]) => normalizeSkuKey(key) === skuKey)?.[1]).find((value) => value != null) ?? "");
    const product = productBySku.get(skuKey);
    const brand = sources.map((item) => item.brands.get(latest.sku)).find((value) => normalizeText(value)) ?? product?.vendor?.name ?? "";
    const priority = sources.map((item) => item.priorities.get(skuKey)).find((value) => normalizeText(value)) ?? product?.erp1ProductPriority ?? product?.erp2ProductPriority ?? "Unspecified";
    const normalizedPriority = normalizeText(priority) || "Unspecified";
    const stock = totalStockBySku.get(skuKey) ?? 0;
    priorityBySku.set(skuKey, normalizedPriority);
    if (!Number.isFinite(standard) || standard <= 0) {
      details.push({
        sku: latest.sku,
        priority: normalizedPriority,
        brand: normalizeText(brand),
        latestPurchasePrice: latest.rate,
        latestPurchaseSupplier: source.latest.get(latest.sku)?.supplier ?? null,
        latestPurchaseDate: latest.date,
        standardSellingPrice: null,
        marginPct: null,
        marginBucket: "missing-standard-price",
        stockAvailable: stock,
        totalRop: 0,
        discountOutcomes: {},
      });
      continue;
    }
    const margin = sellingMargin(standard, latest.rate);
    if (margin == null) continue;
    const marginPct = margin * 100;
    const bucket = marginBucketForPercent(marginPct);
    const discountOutcomes = Object.fromEntries(MARGIN_DISCOUNTS.map((discount) => [discount, classifyDiscountOutcome(standard * (1 - discount / 100), latest.rate)])) as Record<number, DiscountOutcome>;
    details.push({
      sku: latest.sku,
      priority: normalizedPriority,
      brand: normalizeText(brand),
      latestPurchasePrice: latest.rate,
      latestPurchaseSupplier: source.latest.get(latest.sku)?.supplier ?? null,
      latestPurchaseDate: latest.date,
      standardSellingPrice: standard,
      marginPct,
      marginBucket: bucket.key,
      stockAvailable: stock,
      totalRop: 0,
      discountOutcomes,
    });
  }

  details.sort((a, b) => {
    const marginRank = (value: string) => {
      const index = MARGIN_BUCKETS.findIndex((bucket) => bucket.key === value);
      return index >= 0 ? index : MARGIN_BUCKETS.length;
    };
    return marginRank(a.marginBucket) - marginRank(b.marginBucket) || priorityRank(a.priority) - priorityRank(b.priority) || a.sku.localeCompare(b.sku);
  });
  const grouped = buildMarginIssueSummary(details);
  const ropColumnKeys = ropColumns.filter((column) => column.active && column.includeInRop).map((column) => column.key);
  const latestSkuRows = [...latestBySku.values()];
  const ropRows = ropColumnKeys.length === 0 || latestSkuRows.length === 0
    ? []
    : (
        await Promise.all(
          Array.from({ length: Math.ceil(latestSkuRows.length / 500) }, (_, index) =>
            prisma.productOsfRop.findMany({
              where: {
                companyId,
                columnKey: { in: ropColumnKeys },
                sku: { in: latestSkuRows.slice(index * 500, index * 500 + 500).map((row) => row.sku) },
              },
              select: { sku: true, ropQty: true },
            }),
          ),
        )
      ).flat();
  const ropBySku = new Map<string, number>();
  for (const row of ropRows) {
    const skuKey = normalizeSkuKey(row.sku);
    if (!skuKey) continue;
    ropBySku.set(skuKey, (ropBySku.get(skuKey) ?? 0) + row.ropQty);
  }
  const detailsWithRop = details.map((row) => ({
    ...row,
    totalRop: ropBySku.get(normalizeSkuKey(row.sku)) ?? 0,
  }));
  const ropFulfillment = buildRopFulfillmentReport([...latestBySku.keys()].map((skuKey) => ({
    priority: priorityBySku.get(skuKey) ?? "Unspecified",
    stock: totalStockBySku.get(skuKey) ?? 0,
    rop: ropBySku.get(skuKey) ?? 0,
  })));
  return { companyId, reportDate, details: detailsWithRop, ropFulfillment, ...grouped };
}

export function discountCountsText(counts: DiscountCounts): string {
  return OUTCOMES.filter((outcome) => counts[outcome] > 0).map((outcome) => `${outcome} (${counts[outcome]})`).join(", ") || "-";
}

export function discountSummaryText(row: MarginIssueSummaryRow): string {
  const hasCounts = Object.values(row.discountCounts).some((counts) => OUTCOMES.some((outcome) => counts[outcome] > 0));
  if (!hasCounts) return "";
  return MARGIN_DISCOUNTS.map((discount) => `${discount}%: ${discountCountsText(row.discountCounts[discount])}`).join("\n");
}
