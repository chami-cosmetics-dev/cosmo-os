const JUNK_ITEM_TOKENS = new Set([
  "coupon",
  "coupons",
  "gift card",
  "giftcard",
  "gift cards",
  "shipping",
  "tip",
  "fee",
]);

/** Exact SKUs that are not useful as Insight item filters. */
const JUNK_ITEM_SKUS = new Set([
  "fee",
  "sf-1994neht",
  "sf1994neht",
  "sf1994neht*oi",
]);

function normSku(sku: string): string {
  return sku.trim().toLowerCase().replace(/[\s_]+/g, "");
}

/** Drop discount/coupon/gift-card rows that are not real catalog products. */
export function isNonProductInsightItem(input: {
  title?: string | null;
  variant?: string | null;
  sku?: string | null;
  productType?: string | null;
}): boolean {
  const title = (input.title ?? "").trim();
  const variant = (input.variant ?? "").trim();
  const sku = (input.sku ?? "").trim();
  const productType = (input.productType ?? "").trim();
  const fields = [title, variant, sku, productType].map((f) =>
    f.toLowerCase().replace(/\s+/g, " ")
  );
  for (const key of fields) {
    if (JUNK_ITEM_TOKENS.has(key)) return true;
    if (key.includes("coupon")) return true;
  }
  if (sku && JUNK_ITEM_SKUS.has(normSku(sku))) return true;
  const blob = fields.join(" ");
  if (/\bgift[\s-]?cards?\b/.test(blob)) return true;
  if (/\d+\s*%\s*off\b/.test(blob)) return true;
  if (/\bnose and ear trimmer\b/.test(blob)) return true;
  // Shopify/Adapt coupon lines are often just an id, e.g. "104523" + sku coupon.
  if (/^\d+$/.test(title)) return true;
  return false;
}
