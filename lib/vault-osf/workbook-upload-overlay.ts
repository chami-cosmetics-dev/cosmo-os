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
 * Barcode + Priority Status from the manually updated Vault OSF workbook.
 * Team has not uploaded barcodes to ERP yet — file is source of truth for now.
 * When ERP has values later, stop preferring this overlay (or leave cells blank in file).
 */
export function vaultWorkbookUploadExtras(sku: string): VaultWorkbookUploadExtras | null {
  const key = lookupOverlayKey(sku);
  if (!key) return null;
  const row = overlayBySku[key as keyof typeof overlayBySku];
  if (!row || typeof row !== "object") return null;
  return row as VaultWorkbookUploadExtras;
}

/** Prefer uploaded-file barcode/priority when present; ERP fills only gaps. */
export function applyVaultWorkbookUploadToCatalogRow(row: VaultCatalogRow): VaultCatalogRow {
  const extra = vaultWorkbookUploadExtras(row.sku);
  if (!extra) return row;
  const fileBarcode = extra.barcode?.trim() || null;
  const filePriority = extra.priorityStatus?.trim() || null;
  return {
    ...row,
    barcode: fileBarcode || row.barcode?.trim() || null,
    priorityStatus: filePriority || row.priorityStatus?.trim() || null,
  };
}

export function applyVaultWorkbookUploadToCatalog(rows: VaultCatalogRow[]): VaultCatalogRow[] {
  return rows.map(applyVaultWorkbookUploadToCatalogRow);
}
