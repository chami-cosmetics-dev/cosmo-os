export type CartLine = {
  /** Stable product identity: variant id, else product id, else normalized title. */
  key: string;
  quantity: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractLineIdentity(raw: Record<string, unknown>): string | null {
  const variant = asRecord(raw.variant);
  const product = asRecord(raw.product) ?? asRecord(variant?.product);

  const variantId = pickString(
    raw.variant_id,
    raw.variantId,
    variant?.id,
    variant?.admin_graphql_api_id
  );
  if (variantId) return `v:${variantId}`;

  const productId = pickString(
    raw.product_id,
    raw.productId,
    product?.id,
    product?.admin_graphql_api_id
  );
  if (productId) return `p:${productId}`;

  const title = pickString(raw.title, raw.name);
  if (title) return `t:${normalizeTitle(title)}`;
  return null;
}

function extractQuantity(raw: Record<string, unknown>): number | null {
  const qty = raw.quantity;
  if (typeof qty === "number" && Number.isFinite(qty) && qty > 0) {
    return Math.floor(qty);
  }
  if (typeof qty === "string" && qty.trim()) {
    const n = Number(qty);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return null;
}

/** Parse Shopify GraphQL/REST line item JSON into a quantity multiset. */
export function normalizeAbandonedCheckoutLines(lineItemsJson: unknown): CartLine[] {
  let nodes: unknown[] = [];
  if (Array.isArray(lineItemsJson)) {
    nodes = lineItemsJson;
  } else {
    const root = asRecord(lineItemsJson);
    const nested = root?.nodes;
    if (Array.isArray(nested)) nodes = nested;
  }

  const byKey = new Map<string, number>();
  for (const node of nodes) {
    const row = asRecord(node);
    if (!row) continue;
    const key = extractLineIdentity(row);
    const quantity = extractQuantity(row);
    if (!key || quantity == null) continue;
    byKey.set(key, (byKey.get(key) ?? 0) + quantity);
  }

  return [...byKey.entries()]
    .map(([key, quantity]) => ({ key, quantity }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Deterministic fingerprint for exact-duplicate matching (qty-aware). */
export function buildCartFingerprint(lines: CartLine[]): string {
  if (lines.length === 0) return "";
  return lines.map((line) => `${line.key}@${line.quantity}`).join("|");
}

/**
 * True when every line in `older` appears in `newer` with qty ≤ newer qty,
 * and newer has at least one extra product or higher qty (proper subset).
 */
export function isProperCartSubset(older: CartLine[], newer: CartLine[]): boolean {
  if (older.length === 0) return false;
  const newerMap = new Map(newer.map((line) => [line.key, line.quantity]));
  let strict = false;

  for (const line of older) {
    const newerQty = newerMap.get(line.key);
    if (newerQty == null || newerQty < line.quantity) return false;
    if (newerQty > line.quantity) strict = true;
  }

  for (const line of newer) {
    if (!older.some((o) => o.key === line.key)) {
      strict = true;
      break;
    }
  }

  return strict;
}
