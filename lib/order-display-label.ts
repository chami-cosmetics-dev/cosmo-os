/** Business-facing order label: prefer full name, then orderNumber, then shopify id. */

export type OrderDisplayRef = {
  name?: string | null;
  orderNumber?: string | null;
  shopifyOrderId?: string | null;
};

export function formatBusinessOrderNumber(order: OrderDisplayRef): string {
  const name = order.name?.trim();
  if (name) return name;
  const orderNumber = order.orderNumber?.trim();
  if (orderNumber) return orderNumber;
  const shopifyId = order.shopifyOrderId?.trim();
  if (shopifyId) return shopifyId;
  return "—";
}

/** Keep compact rows: do not show the short sequence as a second line. */
export function formatOrderSecondaryLabel(_order: OrderDisplayRef): string | null {
  return null;
}
