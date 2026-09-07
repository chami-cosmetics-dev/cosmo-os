import { describe, expect, it } from "vitest";

import {
  isShopifyOrderFullyRefunded,
  resolveShopifyWebhookFinancialStatus,
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

describe("resolveShopifyWebhookFinancialStatus", () => {
  it("keeps local paid when Shopify still says pending", () => {
    expect(
      resolveShopifyWebhookFinancialStatus({
        existingStatus: "paid",
        incomingStatus: "pending",
        shouldVoid: false,
      }),
    ).toBe("paid");
  });

  it("keeps local partially_paid when Shopify still says pending", () => {
    expect(
      resolveShopifyWebhookFinancialStatus({
        existingStatus: "partially_paid",
        incomingStatus: "pending",
        shouldVoid: false,
      }),
    ).toBe("partially_paid");
  });

  it("restores paid after invoice complete even if Shopify already overwrote pending", () => {
    expect(
      resolveShopifyWebhookFinancialStatus({
        existingStatus: "pending",
        incomingStatus: "pending",
        invoiceCompleteAt: new Date("2026-06-17T00:00:00Z"),
        shouldVoid: false,
      }),
    ).toBe("paid");
  });

  it("still takes Shopify paid and void paths", () => {
    expect(
      resolveShopifyWebhookFinancialStatus({
        existingStatus: "pending",
        incomingStatus: "paid",
        shouldVoid: false,
      }),
    ).toBe("paid");
    expect(
      resolveShopifyWebhookFinancialStatus({
        existingStatus: "paid",
        incomingStatus: "pending",
        shouldVoid: true,
      }),
    ).toBe("voided");
  });
});
