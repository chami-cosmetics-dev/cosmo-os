import { describe, expect, it } from "vitest";

import {
  applyOrderDiscountToErpItemRates,
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

  it("omits rates when ERP should price items for coupon application", () => {
    const items = buildErpItemsFromShopifyLineItems(
      [{ id: 1, price: "7600", quantity: 1, total_discount: "1900.00" }],
      "WH-01",
      "erp_price_list",
    );
    expect(items[0]).toEqual({
      item_code: "1",
      item_name: undefined,
      qty: 1,
      warehouse: "WH-01",
    });
    expect(items[0].rate).toBeUndefined();
  });

  it("bakes NOV15-style order discount into rates so header discount is not required", () => {
    const items = [
      { item_code: "ORD06_2", qty: 1, rate: 7462.5, warehouse: "Main" },
      { item_code: "DRE07_1", qty: 1, rate: 3450, warehouse: "Main" },
    ];
    const baked = applyOrderDiscountToErpItemRates(items, 517.5);
    expect(sumErpInvoiceItemsTotal(baked)).toBe(10395);
    expect(sumErpInvoiceItemsTotal(baked, 400)).toBe(10795);
    expect(baked[0]?.rate).toBe(7108.61);
    expect(baked[1]?.rate).toBe(3286.39);
  });

  it("skips shipping item code when baking order discount", () => {
    const items = [
      { item_code: "ORD06_2", qty: 1, rate: 7462.5, warehouse: "Main" },
      { item_code: "DRE07_1", qty: 1, rate: 3450, warehouse: "Main" },
      { item_code: "SHIP", qty: 1, rate: 400, warehouse: "Main" },
    ];
    const baked = applyOrderDiscountToErpItemRates(items, 517.5, {
      skipItemCodes: ["SHIP"],
    });
    expect(baked.find((row) => row.item_code === "SHIP")?.rate).toBe(400);
    expect(sumErpInvoiceItemsTotal(baked)).toBe(10795);
  });
});
