import { describe, expect, it } from "vitest";

import {
  resolveOrderLineItemsPricing,
  sumLineDiscounts,
  sumOriginalTotals,
} from "@/lib/order-line-item-pricing";

describe("resolveOrderLineItemsPricing", () => {
  it("derives original price and discount from ERP webhook items", async () => {
    const result = await resolveOrderLineItemsPricing({
      sourceName: "erpnext",
      rawPayload: {
        data: {
          name: "SV200-0001",
          items: [
            {
              item_code: "SKU1",
              qty: 1,
              rate: 28760,
              amount: 28760,
              price_list_rate: 33835,
              discount_amount: 5075,
            },
          ],
        },
      },
      lineItems: [{ sku: "SKU1", quantity: 1, price: "28760.00" }],
    });

    expect(result[0].originalPrice).toBe("33835.00");
    expect(result[0].lineDiscount).toBe("5075.00");
    expect(result[0].salePrice).toBe("28760.00");
  });

  it("loads ERP line pricing for Shopify orders linked to an ERP invoice", async () => {
    const result = await resolveOrderLineItemsPricing({
      sourceName: "web",
      erpnextInvoiceId: "SV100-0464",
      rawPayload: null,
      lineItems: [{ sku: "SW035-1", quantity: 1, price: "14500.00" }],
    });

    // Without live ERP in tests, falls back to sale price only.
    expect(result[0].salePrice).toBe("14500.00");
  });
});

describe("sumLineDiscounts", () => {
  it("sums per-line discounts", () => {
    expect(
      sumLineDiscounts([
        {
          salePrice: "100.00",
          saleTotal: "100.00",
          originalPrice: "120.00",
          originalTotal: "120.00",
          lineDiscount: "20.00",
        },
      ]),
    ).toBe("20.00");
  });
});

describe("sumOriginalTotals", () => {
  it("sums original line totals when present", () => {
    expect(
      sumOriginalTotals([
        {
          salePrice: "28760.00",
          saleTotal: "28760.00",
          originalPrice: "33835.00",
          originalTotal: "33835.00",
          lineDiscount: "5075.00",
        },
      ]),
    ).toBe("33835.00");
  });
});
