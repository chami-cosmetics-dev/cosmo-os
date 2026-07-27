/** Business-facing order label: prefer orderNumber, then name, then shopify id. */

export type OrderDisplayRef = {
  name?: string | null;
  orderNumber?: string | null;
  shopifyOrderId?: string | null;
};

export function formatBusinessOrderNumber(order: OrderDisplayRef): string {
  const orderNumber = order.orderNumber?.trim();
  if (orderNumber) return orderNumber;
  const name = order.name?.trim();
  if (name) return name;
  const shopifyId = order.shopifyOrderId?.trim();
  if (shopifyId) return shopifyId;
  return "—";
}

/** Secondary label when both orderNumber and name exist and differ. */
export function formatOrderSecondaryLabel(order: OrderDisplayRef): string | null {
  const orderNumber = order.orderNumber?.trim();
  const name = order.name?.trim();
  if (orderNumber && name && orderNumber !== name && name !== `#${orderNumber}`) {
    return name;
  }
  return null;
}
