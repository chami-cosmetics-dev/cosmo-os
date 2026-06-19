/** Shopify topic for a newly created order — only this topic may import an order into Vault OS. */
export function isShopifyOrderCreateWebhook(topic: string | null | undefined): boolean {
  return topic?.trim().toLowerCase() === "orders/create";
}

/**
 * Non-create webhooks (e.g. orders/updated) must not import orders that were never
 * received via orders/create — e.g. when staff edit a pre-cutoff Shopify order.
 */
export function shouldSkipShopifyOrderWebhookForMissingOrder(
  topic: string | null | undefined,
  orderExists: boolean
): boolean {
  return !orderExists && !isShopifyOrderCreateWebhook(topic);
}
