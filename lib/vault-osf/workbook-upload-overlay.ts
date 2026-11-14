import type { VaultCatalogRow } from "@/lib/vault-osf/types";

import overlayBySku from "@/lib/vault-osf/workbook-upload-overlay-data.json";
import { normalizeVaultOsfSku, resolveVaultOsfManualSkuKey } from "@/lib/vault-osf/sku-policy";

export type VaultWorkbookUploadExtras = {
  barcode?: string;
  priorityStatus?: string;
};

function lookupOverlayKey(sku: string): string | null {
  const k = normalizeVaultOsfSku(sku);
  if (!k) return null;
  if (Object.prototype.hasOwnProperty.call(overlayBySku, k)) return k;
  const manual = resolveVaultOsfManualSkuKey(k);
  if (manual && Object.prototype.hasOwnProperty.call(overlayBySku, manual)) return manual;
  const lower = k.toLowerCase();
  for (const key of Object.keys(overlayBySku)) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

/**
 * Barcode from the manually updated Vault OSF workbook.
 * Overlay fills barcode gaps when ERP `Item Barcode` list is 403; live GET Item
 * covers SKUs missing from this snapshot (e.g. NT025-1 / NW032-2).
 * Priority Status is live ERP / ProductItem — this snapshot must not freeze it.
 */
export function vaultWorkbookUploadExtras(sku: string): VaultWorkbookUploadExtras | null {
  const key = lookupOverlayKey(sku);
  if (!key) return null;
  const row = overlayBySku[key as keyof typeof overlayBySku];
  if (!row || typeof row !== "object") return null;
  return row as VaultWorkbookUploadExtras;
}

/** Prefer uploaded-file barcode when present. Never overwrite live Priority Status. */
export function applyVaultWorkbookUploadToCatalogRow(row: VaultCatalogRow): VaultCatalogRow {
  const extra = vaultWorkbookUploadExtras(row.sku);
  if (!extra) return row;
  const fileBarcode = extra.barcode?.trim() || null;
  return {
    ...row,
    barcode: fileBarcode || row.barcode?.trim() || null,
  };
}

export function applyVaultWorkbookUploadToCatalog(rows: VaultCatalogRow[]): VaultCatalogRow[] {
  return rows.map(applyVaultWorkbookUploadToCatalogRow);
}
