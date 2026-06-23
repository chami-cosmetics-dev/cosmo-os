import { describe, expect, it } from "vitest";

import {
  buildErpItemsFromShopifyLineItems,
  shopifyLineItemListRate,
  sumErpInvoiceItemsTotal,
} from "@/lib/erp-shopify-invoice-items";

describe("erp-shopify-invoice-items", () => {
  it("derives list rate from Shopify line total_discount", () => {
    const li = {
      id: 1,
      price: "7600",
      quantity: 1,
      total_discount: "1900.00",
    };
    expect(shopifyLineItemListRate(li)).toBe(9500);
  });

  it("uses net rate when building items without coupon pricing", () => {
    const items = buildErpItemsFromShopifyLineItems(
      [
        { id: 1, price: "7600", quantity: 1, total_discount: "1900.00" },
        { id: 2, price: "6800", quantity: 1, total_discount: "1700.00" },
      ],
      "WH-01",
      "net",
    );
    expect(items.map((row) => row.rate)).toEqual([7600, 6800]);
    expect(sumErpInvoiceItemsTotal(items)).toBe(14400);
  });

  it("uses list rate when coupon pricing is applied in ERP", () => {
    const items = buildErpItemsFromShopifyLineItems(
      [
        { id: 1, price: "7600", quantity: 1, total_discount: "1900.00" },
        { id: 2, price: "6800", quantity: 1, total_discount: "1700.00" },
      ],
      "WH-01",
      "list",
    );
    expect(items.map((row) => row.rate)).toEqual([9500, 8500]);
    expect(items.every((row) => row.price_list_rate === row.rate)).toBe(true);
    expect(sumErpInvoiceItemsTotal(items)).toBe(18000);
  });
});
