import "server-only";

import { prisma } from "@/lib/prisma";
import { OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { vaultErpGetJson } from "@/lib/vault-osf/erp-client";
import {
  applyVaultOsfSkuPolicy,
  isVaultOsfForceIncludedSku,
  VAULT_OSF_FORCE_INCLUDED_SKUS,
} from "@/lib/vault-osf/sku-policy";
import type { VaultCatalogRow } from "@/lib/vault-osf/types";

const PAGE = 500;
const MAX_PAGES = 80;

export type ErpItemRow = {
  name?: string;
  item_code?: string;
  item_name?: string;
  brand?: string | null;
  item_group?: string | null;
  country_of_origin?: string | null;
  disabled?: number | boolean;
  is_stock_item?: number | boolean;
};

export function isVaultStockItem(row: ErpItemRow): boolean {
  const code = (row.item_code ?? row.name ?? "").trim();
  if (!code) return false;
  if (code.toUpperCase() === "DELIVERY-CHARGES" || code.toUpperCase() === "TEST") return false;
  // Force-included SKUs (e.g. NTC03-1) stay on OSF even when ERP disabled=1.
  if (!isVaultOsfForceIncludedSku(code)) {
    const disabled = row.disabled === 1 || row.disabled === true;
    if (disabled) return false;
  }
  return row.is_stock_item === 1 || row.is_stock_item === true;
}

export function mapErpItemToCatalogRow(
  row: ErpItemRow,
  extras: { barcode?: string | null; priorityStatus?: string | null } = {},
): VaultCatalogRow | null {
  if (!isVaultStockItem(row)) return null;
  const sku = (row.item_code ?? row.name ?? "").trim();
  return {
    sku,
    variantSku: (row.name ?? sku).trim(),
    barcode: extras.barcode?.trim() || null,
    itemName: (row.item_name ?? sku).trim(),
    brand: row.brand?.trim() || null,
    category: row.item_group?.trim() || null,
    country: row.country_of_origin?.trim() || null,
    priorityStatus: extras.priorityStatus?.trim() || null,
  };
}

export async function fetchVaultCatalog(cfg: OsfErpCredentials): Promise<VaultCatalogRow[]> {
  const items: ErpItemRow[] = [];
  const fields = JSON.stringify([
    "name",
    "item_code",
    "item_name",
    "brand",
    "item_group",
    "country_of_origin",
    "disabled",
    "is_stock_item",
  ]);
  const filters = JSON.stringify([
    ["disabled", "=", 0],
    ["is_stock_item", "=", 1],
  ]);

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Item?fields=${encodeURIComponent(fields)}` +
      `&filters=${encodeURIComponent(filters)}` +
      `&limit_start=${page * PAGE}&limit_page_length=${PAGE}`;
    const json = await vaultErpGetJson<{ data?: ErpItemRow[] }>(cfg, path);
    const rows = json.data ?? [];
    items.push(...rows);
    if (rows.length < PAGE) break;
    if (page === MAX_PAGES - 1) {
      throw new OsfErpError(`ERP1 Item catalog exceeded ${MAX_PAGES * PAGE} rows`);
    }
  }

  const barcodes = await fetchItemBarcodes(cfg);
  const bySku = new Map<string, VaultCatalogRow>();
  for (const row of items) {
    const mapped = mapErpItemToCatalogRow(row, {
      barcode: barcodes.get((row.item_code ?? row.name ?? "").trim()) ?? null,
    });
    if (mapped) bySku.set(mapped.sku, mapped);
  }

  // Pull force-included SKUs that ERP list skipped (disabled=1).
  for (const sku of VAULT_OSF_FORCE_INCLUDED_SKUS) {
    if (bySku.has(sku)) continue;
    const forced = await fetchSingleItem(cfg, sku);
    if (!forced) continue;
    const mapped = mapErpItemToCatalogRow(forced, {
      barcode: barcodes.get(sku) ?? forced.barcodes?.[0]?.barcode ?? null,
      priorityStatus: "Newly added",
    });
    if (mapped) bySku.set(mapped.sku, mapped);
  }

  const mapped = applyVaultOsfSkuPolicy([...bySku.values()]);
  mapped.sort((a, b) => a.sku.localeCompare(b.sku));
  return mapped;
}

type ErpItemWithBarcode = ErpItemRow & {
  barcodes?: Array<{ barcode?: string | null }>;
};

async function fetchSingleItem(
  cfg: OsfErpCredentials,
  sku: string,
): Promise<ErpItemWithBarcode | null> {
  try {
    const path = `/api/resource/Item/${encodeURIComponent(sku)}`;
    const json = await vaultErpGetJson<{ data?: ErpItemWithBarcode }>(cfg, path);
    return json.data ?? null;
  } catch {
    return null;
  }
}

async function fetchItemBarcodes(cfg: OsfErpCredentials): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const fields = JSON.stringify(["parent", "barcode"]);
  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const path =
        `/api/resource/Item Barcode?fields=${encodeURIComponent(fields)}` +
        `&limit_start=${page * PAGE}&limit_page_length=${PAGE}`;
      const json = await vaultErpGetJson<{ data?: Array<{ parent?: string; barcode?: string }> }>(
        cfg,
        path,
      );
      const rows = json.data ?? [];
      for (const row of rows) {
        const sku = row.parent?.trim();
        const barcode = row.barcode?.trim();
        if (sku && barcode && !map.has(sku)) map.set(sku, barcode);
      }
      if (rows.length < PAGE) break;
    }
  } catch {
    // Barcode child may be unreadable; catalog still valid without it.
  }
  return map;
}

export async function attachOsPriority(
  companyId: string,
  rows: VaultCatalogRow[],
): Promise<VaultCatalogRow[]> {
  const skus = rows.map((r) => r.sku);
  if (skus.length === 0) return rows;
  const items = await prisma.productItem.findMany({
    where: { companyId, sku: { in: skus } },
    select: { sku: true, erp1ProductPriority: true, barcode: true },
    orderBy: { updatedAt: "desc" },
  });
  const bySku = new Map<string, { priority: string | null; barcode: string | null }>();
  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku || bySku.has(sku)) continue;
    bySku.set(sku, {
      priority: item.erp1ProductPriority?.trim() || null,
      barcode: item.barcode?.trim() || null,
    });
  }
  return rows.map((row) => {
    const extra = bySku.get(row.sku);
    return {
      ...row,
      priorityStatus:
        extra?.priority ??
        (isVaultOsfForceIncludedSku(row.sku)
          ? (row.priorityStatus ?? "Newly added")
          : row.priorityStatus),
      barcode: row.barcode || extra?.barcode || null,
    };
  });
}
