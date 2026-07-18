import { describe, expect, it } from "vitest";

import {
  isShopifyOrderFullyRefunded,
  shouldVoidShopifyOrder,
} from "@/lib/shopify-order-financial-status";

describe("Shopify order financial status", () => {
  it("maps fully refunded Shopify orders to the void path", () => {
    expect(isShopifyOrderFullyRefunded(" refunded ")).toBe(true);
    expect(shouldVoidShopifyOrder({ financialStatus: "refunded" })).toBe(true);
  });

  it("keeps partially refunded orders out of the full-refund void path", () => {
    expect(isShopifyOrderFullyRefunded("partially_refunded")).toBe(false);
    expect(shouldVoidShopifyOrder({ financialStatus: "partially_refunded" })).toBe(false);
  });

  it("continues to void cancelled, Shopify-voided, and negative orders", () => {
    expect(shouldVoidShopifyOrder({ cancelledAt: "2026-07-18T00:00:00Z" })).toBe(true);
    expect(shouldVoidShopifyOrder({ financialStatus: "voided" })).toBe(true);
    expect(shouldVoidShopifyOrder({ totalPriceIsNegative: true })).toBe(true);
  });

  it("does not void ordinary paid orders", () => {
    expect(shouldVoidShopifyOrder({ financialStatus: "paid" })).toBe(false);
  });
});
