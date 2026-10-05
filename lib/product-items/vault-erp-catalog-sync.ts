import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getAllOsfErpInstances,
  OsfErpError,
  type OsfErpCredentials,
} from "@/lib/osf/erp-stock";
import { applyStandardSellingRatesToCatalog } from "@/lib/product-items/vault-catalog-price";
import { resolveErpSlots, normalizeSkuKey } from "@/lib/product-items/erp-priority-sync";
import {
  fetchItemBarcodeList,
  fillMissingItemBarcodes,
  lookupBarcode,
} from "@/lib/vault-osf/erp-barcodes";
import { fetchStandardSellingCandidates } from "@/lib/vault-osf/erp-pricing";
import { isVaultOsfForceIncludedSku, VAULT_OSF_FORCE_INCLUDED_SKUS } from "@/lib/vault-osf/sku-policy";
import { vaultWorkbookUploadExtras } from "@/lib/vault-osf/workbook-upload-overlay";

const PAGE = 500;
const MAX_PAGES = 80;
const WRITE_CHUNK = 50;

export type VaultErpCatalogItem = {
  sku: string;
  itemName: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  standardRate: number;
  disabled: boolean;
};

type ErpItemRow = {
  name?: string;
  item_code?: string;
  item_name?: string;
  brand?: string | null;
  item_group?: string | null;
  disabled?: number | boolean;
  is_stock_item?: number | boolean;
  standard_rate?: number | string | null;
};

async function erpGetJson<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: {
      Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

function isSyncableStockItem(row: ErpItemRow): boolean {
  const code = (row.item_code ?? row.name ?? "").trim();
  if (!code) return false;
  if (code.toUpperCase() === "DELIVERY-CHARGES" || code.toUpperCase() === "TEST") return false;
  if (!isVaultOsfForceIncludedSku(code)) {
    if (row.disabled === 1 || row.disabled === true) return false;
  }
  return row.is_stock_item === 1 || row.is_stock_item === true;
}

async function attachMissingErpBarcodes(
  catalog: Map<string, VaultErpCatalogItem>,
  cfg: OsfErpCredentials,
) {
  const missing = [...catalog.values()]
    .filter((item) => !item.barcode?.trim() && !vaultWorkbookUploadExtras(item.sku)?.barcode)
    .map((item) => item.sku);
  if (missing.length === 0) return;
  const extra = await fillMissingItemBarcodes((path) => erpGetJson(cfg, path), missing);
  for (const item of catalog.values()) {
    if (item.barcode?.trim()) continue;
    const found = lookupBarcode(extra, item.sku);
    if (found) item.barcode = found;
  }
}

async function fetchErpCatalogItems(cfg: OsfErpCredentials): Promise<Map<string, VaultErpCatalogItem>> {
  const out = new Map<string, VaultErpCatalogItem>();
  const fields = JSON.stringify([
    "name",
    "item_code",
    "item_name",
    "brand",
    "item_group",
    "disabled",
    "is_stock_item",
    "standard_rate",
  ]);

  // Enabled stock items
  const filters = JSON.stringify([
    ["disabled", "=", 0],
    ["is_stock_item", "=", 1],
  ]);

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Item?fields=${encodeURIComponent(fields)}` +
      `&filters=${encodeURIComponent(filters)}` +
      `&limit_start=${page * PAGE}&limit_page_length=${PAGE}`;
    const json = await erpGetJson<{ data?: ErpItemRow[] }>(cfg, path);
    const rows = json.data ?? [];
    for (const row of rows) {
      if (!isSyncableStockItem(row)) continue;
      const sku = (row.item_code ?? row.name ?? "").trim();
      const key = normalizeSkuKey(sku);
      const rate = Number(row.standard_rate);
      out.set(key, {
        sku,
        itemName: (row.item_name ?? sku).trim(),
        brand: row.brand?.trim() || null,
        category: row.item_group?.trim() || null,
        barcode: null,
        standardRate: Number.isFinite(rate) && rate > 0 ? rate : 0,
        disabled: false,
      });
    }
    if (rows.length < PAGE) break;
    if (page === MAX_PAGES - 1) {
      throw new OsfErpError(`ERP Item catalog exceeded ${MAX_PAGES * PAGE} rows`);
    }
  }

  // Force-included (may be disabled)
  for (const sku of VAULT_OSF_FORCE_INCLUDED_SKUS) {
    const key = normalizeSkuKey(sku);
    if (out.has(key)) continue;
    try {
      const json = await erpGetJson<{ data?: ErpItemRow }>(
        cfg,
        `/api/resource/Item/${encodeURIComponent(sku)}`,
      );
      const row = json.data;
      if (!row || !isSyncableStockItem(row)) continue;
      const rate = Number(row.standard_rate);
      out.set(key, {
        sku,
        itemName: (row.item_name ?? sku).trim(),
        brand: row.brand?.trim() || null,
        category: row.item_group?.trim() || null,
        barcode: null,
        standardRate: Number.isFinite(rate) && rate > 0 ? rate : 0,
        disabled: row.disabled === 1 || row.disabled === true,
      });
    } catch {
      // missing on this ERP
    }
  }

  const barcodes = await fetchItemBarcodeList((path) => erpGetJson(cfg, path));
  for (const item of out.values()) {
    const barcode = lookupBarcode(barcodes, item.sku);
    if (barcode) item.barcode = barcode;
  }

  return out;
}

function mergeCatalogs(
  erp1: Map<string, VaultErpCatalogItem>,
  erp2: Map<string, VaultErpCatalogItem>,
): Map<string, VaultErpCatalogItem> {
  const merged = new Map(erp2);
  // ERP1 wins on conflict (pricing / catalog master for Vault)
  for (const [key, item] of erp1) {
    merged.set(key, item);
  }
  return merged;
}

function ratesFromCandidates(candidates: Map<string, { rate: number }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [sku, cand] of candidates) {
    out.set(sku, cand.rate);
  }
  return out;
}

export type VaultErpCatalogSyncResult = {
  status: "ok" | "failed" | "skipped";
  created: number;
  updated: number;
  catalogSize: number;
  erp1Count: number;
  erp2Count: number;
  error: string | null;
};

/**
 * Vault OS: pull all stock Items from ERP1 + ERP2 into ProductItem so the
 * Products page lists every supplement SKU (not only Shopify-synced rows).
 */
export async function syncVaultErpCatalogToProductItems(
  companyId: string,
): Promise<VaultErpCatalogSyncResult> {
  const location = await prisma.companyLocation.findFirst({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: { id: true, shopifyLocationId: true },
  });
  if (!location) {
    return {
      status: "failed",
      created: 0,
      updated: 0,
      catalogSize: 0,
      erp1Count: 0,
      erp2Count: 0,
      error: "No company location — create a location before ERP item sync",
    };
  }

  const instances = await getAllOsfErpInstances(companyId);
  const slots = resolveErpSlots(instances);
  const erp1 = slots.erp1 ? instances.find((i) => i.id === slots.erp1!.id) : null;
  const erp2 = slots.erp2 ? instances.find((i) => i.id === slots.erp2!.id) : null;

  let erp1Map = new Map<string, VaultErpCatalogItem>();
  let erp2Map = new Map<string, VaultErpCatalogItem>();
  try {
    const [a, b] = await Promise.all([
      erp1 ? fetchErpCatalogItems(erp1.cfg) : Promise.resolve(new Map()),
      erp2 ? fetchErpCatalogItems(erp2.cfg) : Promise.resolve(new Map()),
    ]);
    erp1Map = a;
    erp2Map = b;
  } catch (err) {
    return {
      status: "failed",
      created: 0,
      updated: 0,
      catalogSize: 0,
      erp1Count: 0,
      erp2Count: 0,
      error: (err instanceof Error ? err.message : "ERP catalog fetch failed").slice(0, 300),
    };
  }

  if (erp1Map.size === 0 && erp2Map.size === 0) {
    return {
      status: "failed",
      created: 0,
      updated: 0,
      catalogSize: 0,
      erp1Count: 0,
      erp2Count: 0,
      error: "No ERP items returned from ERP1/ERP2",
    };
  }

  const catalog = mergeCatalogs(erp1Map, erp2Map);
  const asOfDate = new Date().toISOString().slice(0, 10);
  try {
    const [erp1Prices, erp2Prices] = await Promise.all([
      erp1 ? fetchStandardSellingCandidates(erp1.cfg, asOfDate) : Promise.resolve(new Map()),
      erp2 ? fetchStandardSellingCandidates(erp2.cfg, asOfDate) : Promise.resolve(new Map()),
    ]);
    applyStandardSellingRatesToCatalog(
      catalog,
      ratesFromCandidates(erp1Prices),
      ratesFromCandidates(erp2Prices),
    );
  } catch {
    // Keep Item.standard_rate if Item Price pages fail — catalog still upserts.
  }
  if (erp1) await attachMissingErpBarcodes(catalog, erp1.cfg);
  if (erp2) await attachMissingErpBarcodes(catalog, erp2.cfg);
  const existing = await prisma.productItem.findMany({
    where: { companyId, sku: { not: null } },
    select: { id: true, sku: true },
  });
  const existingByKey = new Map<string, string[]>();
  for (const row of existing) {
    const key = normalizeSkuKey(row.sku);
    if (!key) continue;
    const list = existingByKey.get(key) ?? [];
    list.push(row.id);
    existingByKey.set(key, list);
  }

  let created = 0;
  let updated = 0;
  const shopifyLoc =
    location.shopifyLocationId?.trim() || `vault-erp-loc:${location.id}`;

  const entries = [...catalog.entries()];
  for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
    const chunk = entries.slice(i, i + WRITE_CHUNK);
    await Promise.all(
      chunk.map(async ([key, item]) => {
        // File barcode wins until ERP has barcodes uploaded.
        const uploadBarcode =
          vaultWorkbookUploadExtras(item.sku)?.barcode?.trim() ||
          item.barcode?.trim() ||
          null;
        const ids = existingByKey.get(key);
        if (ids?.length) {
          const result = await prisma.productItem.updateMany({
            where: { companyId, id: { in: ids } },
            data: {
              productTitle: item.itemName,
              ...(uploadBarcode ? { barcode: uploadBarcode } : {}),
              ...(item.standardRate > 0
                ? { price: new Prisma.Decimal(item.standardRate) }
                : {}),
            },
          });
          updated += result.count;
          return;
        }

        await prisma.productItem.create({
          data: {
            companyId,
            companyLocationId: location.id,
            shopifyLocationId: shopifyLoc,
            shopifyProductId: `vault-erp-product:${key}`,
            shopifyVariantId: `vault-erp-variant:${key}`,
            productTitle: item.itemName,
            sku: item.sku,
            barcode: uploadBarcode,
            price: new Prisma.Decimal(item.standardRate > 0 ? item.standardRate : 0),
            status: "active",
            productType: item.category,
          },
        });
        created += 1;
      }),
    );
  }

  return {
    status: "ok",
    created,
    updated,
    catalogSize: catalog.size,
    erp1Count: erp1Map.size,
    erp2Count: erp2Map.size,
    error: null,
  };
}
