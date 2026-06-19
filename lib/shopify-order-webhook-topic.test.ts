import { describe, expect, it } from "vitest";

import {
  isShopifyOrderCreateWebhook,
  shouldSkipShopifyOrderWebhookForMissingOrder,
} from "@/lib/shopify-order-webhook-topic";

describe("shopify-order-webhook-topic", () => {
  it("treats only orders/create as a create webhook", () => {
    expect(isShopifyOrderCreateWebhook("orders/create")).toBe(true);
    expect(isShopifyOrderCreateWebhook("ORDERS/CREATE")).toBe(true);
    expect(isShopifyOrderCreateWebhook("orders/updated")).toBe(false);
    expect(isShopifyOrderCreateWebhook(null)).toBe(false);
  });

  it("skips non-create webhooks when the order is missing", () => {
    expect(shouldSkipShopifyOrderWebhookForMissingOrder("orders/updated", false)).toBe(
      true
    );
    expect(shouldSkipShopifyOrderWebhookForMissingOrder("orders/paid", false)).toBe(
      true
    );
    expect(shouldSkipShopifyOrderWebhookForMissingOrder("orders/create", false)).toBe(
      false
    );
    expect(shouldSkipShopifyOrderWebhookForMissingOrder("orders/updated", true)).toBe(
      false
    );
  });
});
