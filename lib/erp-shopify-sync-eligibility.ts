import type { CompanyLocation, ErpnextInstance } from "@prisma/client";

import { isOrderBeforeImportCutoff } from "@/lib/order-import-cutoff";

export type LocationForErpShopifySync = CompanyLocation & {
  erpnextInstance: Pick<ErpnextInstance, "shopifySyncEnabledAt"> | null;
};

export type ErpShopifySyncSkipReason =
  | "import_cutoff"
  | "sync_not_enabled"
  | "before_sync_enabled";

export function getErpShopifySyncEnabledAt(
  instance: Pick<ErpnextInstance, "shopifySyncEnabledAt"> | null | undefined
): Date | null {
  return instance?.shopifySyncEnabledAt ?? null;
}

export function isErpShopifySyncActive(
  instance: Pick<ErpnextInstance, "shopifySyncEnabledAt"> | null | undefined
): boolean {
  return getErpShopifySyncEnabledAt(instance) != null;
}

export function isOrderBeforeErpShopifySyncEnabled(
  orderCreatedAt: Date,
  instance: Pick<ErpnextInstance, "shopifySyncEnabledAt"> | null | undefined
): boolean {
  const enabledAt = getErpShopifySyncEnabledAt(instance);
  if (!enabledAt) {
    return true;
  }
  return orderCreatedAt < enabledAt;
}

export function getErpShopifySyncSkipReason(
  orderCreatedAt: Date,
  location: LocationForErpShopifySync
): ErpShopifySyncSkipReason | null {
  if (isOrderBeforeImportCutoff(orderCreatedAt)) {
    return "import_cutoff";
  }

  const instance = location.erpnextInstance;
  if (!isErpShopifySyncActive(instance)) {
    return "sync_not_enabled";
  }

  if (isOrderBeforeErpShopifySyncEnabled(orderCreatedAt, instance)) {
    return "before_sync_enabled";
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
  context: { orderId?: string; createdAt?: string; enabledAt?: string | null }
): string {
  switch (reason) {
    case "import_cutoff":
      return `[ERPNext] Skipping sync — order is before ORDER_IMPORT_CUTOFF (${context.createdAt ?? "unknown"})`;
    case "sync_not_enabled":
      return "[ERPNext] Skipping sync — Shopify → ERP sync is not enabled on this ERP instance yet";
    case "before_sync_enabled":
      return `[ERPNext] Skipping sync — order is before Shopify → ERP sync was enabled (${context.enabledAt ?? "unknown"})`;
  }
}
