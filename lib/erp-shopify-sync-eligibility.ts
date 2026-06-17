import type { CompanyLocation, ErpnextInstance } from "@prisma/client";

import { isOrderBeforeImportCutoff } from "@/lib/order-import-cutoff";

export type LocationForErpShopifySync = CompanyLocation & {
  erpnextInstance: ErpnextInstance | null;
};

export type ErpShopifySyncSkipReason = "import_cutoff";

/**
 * Shopify → ERP sync is always active. The only block is the import cutoff date
 * (`ORDER_IMPORT_CUTOFF`): orders created before it are never synced to ERPNext.
 */
export function getErpShopifySyncSkipReason(
  orderCreatedAt: Date,
  _location: LocationForErpShopifySync
): ErpShopifySyncSkipReason | null {
  if (isOrderBeforeImportCutoff(orderCreatedAt)) {
    return "import_cutoff";
  }
  return null;
}

export function shouldSkipShopifyOrderErpSync(
  orderCreatedAt: Date,
  location: LocationForErpShopifySync
): boolean {
  return getErpShopifySyncSkipReason(orderCreatedAt, location) != null;
}

export function erpShopifySyncSkipLogMessage(
  reason: ErpShopifySyncSkipReason,
  context: { orderId?: string; createdAt?: string }
): string {
  switch (reason) {
    case "import_cutoff":
      return `[ERPNext] Skipping sync — order is before ORDER_IMPORT_CUTOFF (${context.createdAt ?? "unknown"})`;
  }
}
