/**
 * When `ORDER_IMPORT_CUTOFF` is set (YYYY-MM-DD), Shopify orders created before that
 * date are ignored by Vault OS and never synced to ERPNext.
 *
 * Intended for Vault OS (.env.vault). Leave unset on Cosmo environments.
 */
const CUTOFF_ENV = "ORDER_IMPORT_CUTOFF";

let cachedCutoff: Date | null | undefined;

function parseCutoffDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    console.warn(`[Order import cutoff] Invalid ${CUTOFF_ENV}="${raw}" — expected YYYY-MM-DD`);
    return null;
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    console.warn(`[Order import cutoff] Invalid ${CUTOFF_ENV}="${raw}" — could not parse date`);
    return null;
  }
  return parsed;
}

/** UTC start of cutoff day, or null when import cutoff is not configured. */
export function getOrderImportCutoff(): Date | null {
  if (cachedCutoff !== undefined) {
    return cachedCutoff;
  }

  const raw = process.env[CUTOFF_ENV]?.trim();
  if (!raw) {
    cachedCutoff = null;
    return cachedCutoff;
  }

  cachedCutoff = parseCutoffDate(raw);
  return cachedCutoff;
}

export function isShopifyOrderBeforeImportCutoff(createdAt: string | null | undefined): boolean {
  const cutoff = getOrderImportCutoff();
  if (!cutoff || !createdAt?.trim()) {
    return false;
  }
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed < cutoff;
}

export function isOrderBeforeImportCutoff(orderCreatedAt: Date): boolean {
  const cutoff = getOrderImportCutoff();
  if (!cutoff) {
    return false;
  }
  return orderCreatedAt < cutoff;
}
