export type MerchantOrderLineRecord = {
  shopifyLineItemId: string;
  quantity: number;
  price: { toString(): string } | number | string | null;
  discountPercent: { toString(): string } | number | string | null;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  shopifyVariantId: string;
};

export type MerchantOrderRecord = {
  shopifyOrderId: string;
  name: string | null;
  orderNumber: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  createdAt: Date;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  currency: string | null;
  subtotalPrice: { toString(): string } | number | string | null;
  totalShipping: { toString(): string } | number | string | null;
  totalTax: { toString(): string } | number | string | null;
  totalPrice: { toString(): string } | number | string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  rawPayload: unknown;
  lineItems: MerchantOrderLineRecord[];
};

type Money = { amount: string; currencyCode: string };

type GuideAddress = {
  address1: string;
  city: string;
  country: string;
  firstName: string;
  lastName: string;
  zip: string;
};

function asNumber(value: { toString(): string } | number | string | null | undefined): number {
  if (value == null) return 0;
  const numeric = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(numeric) ? numeric : 0;
}

function moneyAmount(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return (Math.round(value * 100) / 100).toFixed(2);
}

function currencyCode(value: string | null): string {
  const code = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(code) ? code : "LKR";
}

function money(value: { toString(): string } | number | string | null, currency: string): Money {
  return { amount: moneyAmount(asNumber(value)), currencyCode: currency };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function httpsUrl(value: unknown): string {
  return typeof value === "string" && value.startsWith("https://") ? value : "";
}

export function toGuideFinancialStatus(value: string | null): string {
  const raw = value?.trim().toLowerCase() ?? "";
  if (!raw) return "";
  return raw.toUpperCase();
}

/** Shopify REST `null` fulfillment means the order is not fulfilled. */
export function toGuideFulfillmentStatus(value: string | null): string {
  const raw = value?.trim().toLowerCase() ?? "";
  if (!raw || raw === "unfulfilled") return "UNFULFILLED";
  if (raw === "partial" || raw === "partially_fulfilled") return "PARTIALLY_FULFILLED";
  return raw.toUpperCase();
}

function shopifyGid(kind: "Order" | "ProductVariant", id: string): string {
  if (id.startsWith("gid://")) return id;
  return `gid://shopify/${kind}/${id}`;
}

function orderNumberValue(orderNumber: string | null, name: string | null): number {
  const fromField = orderNumber ? Number.parseInt(orderNumber, 10) : Number.NaN;
  if (Number.isFinite(fromField)) return fromField;
  const fromName = name?.match(/\d+/)?.[0];
  return fromName ? Number.parseInt(fromName, 10) : 0;
}

function displayPhone(stored: string | null): string {
  if (!stored) return "";
  const digits = stored.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `+94${digits.slice(1)}`;
  if (digits.startsWith("94") && digits.length === 11) return `+${digits}`;
  if (stored.startsWith("+")) return stored;
  return stored;
}

function rawObject(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

function rawLineById(payload: unknown): Map<string, Record<string, unknown>> {
  const lines = new Map<string, Record<string, unknown>>();
  const raw = rawObject(payload);
  const items = raw?.line_items;
  if (!Array.isArray(items)) return lines;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    if (id == null) continue;
    lines.set(String(id), item as Record<string, unknown>);
  }
  return lines;
}

function mapAddress(value: unknown): GuideAddress {
  const address = rawObject(value);
  return {
    address1: text(address?.address1),
    city: text(address?.city),
    country: text(address?.country),
    firstName: text(address?.firstName ?? address?.first_name),
    lastName: text(address?.lastName ?? address?.last_name),
    zip: text(address?.zip),
  };
}

function lineImage(line: MerchantOrderLineRecord, rawLine: Record<string, unknown> | undefined): string {
  const stored = httpsUrl(line.imageUrl);
  if (stored) return stored;
  const image = rawLine?.image;
  if (!image || typeof image !== "object") return "";
  const record = image as Record<string, unknown>;
  return httpsUrl(record.originalSrc ?? record.src);
}

function processedAt(record: MerchantOrderRecord): string {
  const raw = text(rawObject(record.rawPayload)?.processed_at);
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return record.createdAt.toISOString();
}

export function presentMerchantOrder(record: MerchantOrderRecord) {
  const currency = currencyCode(record.currency);
  const rawLines = rawLineById(record.rawPayload);
  const statusUrl = httpsUrl(rawObject(record.rawPayload)?.order_status_url);

  return {
    id: shopifyGid("Order", record.shopifyOrderId),
    name: record.name ?? "",
    orderNumber: orderNumberValue(record.orderNumber, record.name),
    email: record.customerEmail ?? "",
    phone: displayPhone(record.customerPhone),
    processedAt: processedAt(record),
    financialStatus: toGuideFinancialStatus(record.financialStatus),
    fulfillmentStatus: toGuideFulfillmentStatus(record.fulfillmentStatus),
    currencyCode: currency,
    customerUrl: "",
    statusUrl,
    subtotalPriceV2: money(record.subtotalPrice, currency),
    totalShippingPriceV2: money(record.totalShipping, currency),
    totalTaxV2: money(record.totalTax, currency),
    totalPriceV2: money(record.totalPrice, currency),
    shippingAddress: mapAddress(record.shippingAddress),
    billingAddress: mapAddress(record.billingAddress),
    lineItems: record.lineItems.map((line) => {
      const rawLine = rawLines.get(line.shopifyLineItemId);
      const quantity = line.quantity;
      const original = asNumber(line.price) * quantity;
      const rawDiscount = asNumber(
        typeof rawLine?.total_discount === "string" || typeof rawLine?.total_discount === "number"
          ? rawLine.total_discount
          : null,
      );
      const percent = asNumber(line.discountPercent);
      const discounted =
        rawDiscount > 0 ? Math.max(0, original - rawDiscount) : original * (1 - percent / 100);
      const currentQuantityRaw = rawLine?.current_quantity;
      const currentQuantity =
        typeof currentQuantityRaw === "number" && Number.isFinite(currentQuantityRaw)
          ? currentQuantityRaw
          : quantity;

      return {
        title: line.title || text(rawLine?.title) || "Item",
        quantity,
        currentQuantity,
        originalTotalPrice: { amount: moneyAmount(original), currencyCode: currency },
        discountedTotalPrice: { amount: moneyAmount(discounted), currencyCode: currency },
        variant: {
          id: shopifyGid("ProductVariant", line.shopifyVariantId),
          title: line.variantTitle || text(rawLine?.variant_title),
          sku: line.sku || text(rawLine?.sku),
          image: { originalSrc: lineImage(line, rawLine) },
        },
      };
    }),
  };
}

export function presentMerchantOrdersPage(input: {
  page: number;
  limit: number;
  total: number;
  orders: MerchantOrderRecord[];
}) {
  return {
    page: input.page,
    limit: input.limit,
    total: input.total,
    orders: input.orders.map(presentMerchantOrder),
  };
}
