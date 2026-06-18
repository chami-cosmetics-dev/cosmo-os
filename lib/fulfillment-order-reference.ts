export type FulfillmentOrderRefInput = {
  id?: string;
  name?: string | null;
  orderNumber?: string | null;
  shopifyOrderId?: string | null;
  erpnextInvoiceId?: string | null;
  sourceName?: string | null;
};

function isPlaceholderErpInvoiceId(id: string | null | undefined) {
  return !id || id === "pending" || id === "pending_approval";
}

function isSyntheticErpShopifyId(id: string | null | undefined): boolean {
  return Boolean(id?.trim().startsWith("erp-"));
}

/** Shopify / web order reference for printed invoices (excludes internal erp-* ids). */
export function resolveInvoiceShopifyRef(order: FulfillmentOrderRefInput): string | null {
  const source = order.sourceName?.trim().toLowerCase() ?? "";
  const isErpOrigin = source === "erpnext" || source === "erpnext-pos";
  const erpRef = resolveErpOrderRef(order);
  const name = order.name?.trim() || null;
  const orderNumber = order.orderNumber?.trim() || null;
  const shopifyId = order.shopifyOrderId?.trim() || null;

  if (isErpOrigin) {
    if (orderNumber && orderNumber !== erpRef && orderNumber !== name) {
      return orderNumber;
    }
    if (shopifyId && !isSyntheticErpShopifyId(shopifyId)) {
      return shopifyId;
    }
    return null;
  }

  if (name && name !== erpRef) return name;
  if (orderNumber && orderNumber !== erpRef) return orderNumber;
  if (shopifyId && !isSyntheticErpShopifyId(shopifyId)) return shopifyId;
  return null;
}

/** ERP Sales Invoice number for printed invoices. */
export function resolveInvoiceErpRef(order: FulfillmentOrderRefInput): string | null {
  const fromField = resolveErpOrderRef(order);
  if (fromField) return fromField;

  const source = order.sourceName?.trim().toLowerCase() ?? "";
  if (source === "erpnext" || source === "erpnext-pos") {
    const name = order.name?.trim();
    if (name && !isPlaceholderErpInvoiceId(name)) return name;
  }
  return null;
}

export function formatInvoiceOrderReference(order: FulfillmentOrderRefInput): {
  primary: string;
  shopifyRef: string | null;
  erpRef: string | null;
  showBoth: boolean;
} {
  const shopifyRef = resolveInvoiceShopifyRef(order);
  const erpRef = resolveInvoiceErpRef(order);
  const showBoth = Boolean(shopifyRef && erpRef && shopifyRef !== erpRef);
  const primary = showBoth
    ? `${shopifyRef} / ${erpRef}`
    : shopifyRef ?? erpRef ?? order.name ?? order.orderNumber ?? order.id ?? "—";
  return { primary, shopifyRef, erpRef, showBoth };
}

export function resolveShopifyOrderRef(order: FulfillmentOrderRefInput): string | null {
  const fromName = order.name?.trim() || order.orderNumber?.trim();
  if (fromName) return fromName;
  const shopifyId = order.shopifyOrderId?.trim();
  if (shopifyId) return shopifyId;
  return null;
}

export function resolveErpOrderRef(order: FulfillmentOrderRefInput): string | null {
  const erpId = order.erpnextInvoiceId?.trim();
  if (!erpId || isPlaceholderErpInvoiceId(erpId)) return null;
  return erpId;
}

export function formatFulfillmentOrderReferenceText(order: FulfillmentOrderRefInput): string {
  const shopifyRef = resolveShopifyOrderRef(order);
  const erpRef = resolveErpOrderRef(order);
  if (shopifyRef && erpRef && erpRef !== shopifyRef) {
    return `${shopifyRef} / ${erpRef}`;
  }
  return shopifyRef ?? erpRef ?? order.id ?? "—";
}

export function fulfillmentOrderSearchTokens(order: FulfillmentOrderRefInput): string {
  return [
    order.name,
    order.orderNumber,
    order.shopifyOrderId,
    order.erpnextInvoiceId,
    order.id,
  ]
    .filter(Boolean)
    .join(" ");
}
