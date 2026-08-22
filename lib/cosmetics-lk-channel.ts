/**
 * How a Cosmetics.lk order reached us. Distinct from the dashboard card's
 * Web/POS/Manual pie, which folds ERP sales invoices into Web.
 */
export type CosmeticsLkChannel = "website" | "erp1" | "manual";

export const COSMETICS_LK_CHANNEL_LABELS: Record<CosmeticsLkChannel, string> = {
  website: "Website",
  erp1: "ERP1",
  manual: "Manual",
};

/** Display order, independent of amounts. */
export const COSMETICS_LK_CHANNEL_KEYS: CosmeticsLkChannel[] = [
  "website",
  "erp1",
  "manual",
];

const ERP1_SOURCE_NAMES = new Set(["erpnext", "erpnext-pos", "pos"]);
const MANUAL_SOURCE_NAMES = new Set(["manual"]);

/**
 * ERP1 = Cosmetics.lk ERP company (counter/POS and ERP sales invoices).
 * Manual = created inside Cosmo OS. Everything else (web, shopify, blank,
 * unknown) is treated as the cosmetics.lk website.
 */
export function resolveCosmeticsLkChannel(
  sourceName: string | null | undefined,
): CosmeticsLkChannel {
  const normalized = (sourceName ?? "").trim().toLowerCase();
  if (ERP1_SOURCE_NAMES.has(normalized)) return "erp1";
  if (MANUAL_SOURCE_NAMES.has(normalized)) return "manual";
  return "website";
}

export function getCosmeticsLkChannelLabel(channel: CosmeticsLkChannel): string {
  return COSMETICS_LK_CHANNEL_LABELS[channel];
}
