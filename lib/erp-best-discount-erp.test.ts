import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { couponFieldsForInvoiceCreate, resolveCouponInvoiceItemRates } from "@/lib/erp-best-discount-erp";

const cfg = {
  baseUrl: "https://erp.example.com",
  apiKey: "key",
  apiSecret: "secret",
};

describe("couponFieldsForInvoiceCreate", () => {
  it("strips coupon_code so ERP cannot reprice, keeps label on custom_coupon_code", () => {
    expect(
      couponFieldsForInvoiceCreate({ coupon_code: "SV10", custom_merchant_coupon_code: "SHOPIFY" }, "SV10"),
    ).toEqual({
      custom_merchant_coupon_code: "SHOPIFY",
      custom_coupon_code: "SV10",
    });
  });
});

describe("resolveCouponInvoiceItemRates", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies tabloid 30% to GABA and SV10 10% to other SKUs when total matches Shopify", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/Pricing%20Rule/PRLE-0026")) {
        return new Response(
          JSON.stringify({ data: { discount_percentage: 10, rate_or_discount: "Discount Percentage" } }),
          { status: 200 },
        );
      }
      if (url.includes("/Pricing%20Rule?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                name: "PRLE-0023",
                disable: 0,
                coupon_code_based: 0,
                valid_from: "2026-09-21",
                valid_upto: "2026-10-31",
                company: "SupplementVault.lk",
                discount_percentage: 30,
                item_code: "NW049-2",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/Item%20Price?")) {
        return new Response(
          JSON.stringify({
            data: [
              { item_code: "NW049-2", price_list_rate: 10950 },
              { item_code: "WN002-1", price_list_rate: 9950 },
              { item_code: "VP009-1", price_list_rate: 39500 },
              { item_code: "WN006-1", price_list_rate: 7900 },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });

    const productItems = [
      { item_code: "WN002-1", qty: 1, warehouse: "WH" },
      { item_code: "NW049-2", qty: 1, warehouse: "WH" },
      { item_code: "VP009-1", qty: 1, warehouse: "WH" },
      { item_code: "WN006-1", qty: 3, warehouse: "WH" },
    ];
    const netFallback = productItems.map((row) => ({ ...row, rate: 1 }));

    const result = await resolveCouponInvoiceItemRates({
      cfg,
      productItems,
      netFallbackItems: netFallback,
      pricingRule: "PRLE-0026",
      company: "SupplementVault.lk",
      asOfDate: "2026-10-24",
      shopifyGrandTotal: 73900,
      shippingAmt: 400,
    });

    expect(result.usedBestDiscount).toBe(true);
    expect(result.couponPercent).toBe(10);
    expect(result.items.find((row) => row.item_code === "NW049-2")?.rate).toBe(7665);
    expect(result.items.find((row) => row.item_code === "WN002-1")?.rate).toBe(8955);
    expect(result.items.find((row) => row.item_code === "VP009-1")?.rate).toBe(35550);
    expect(result.items.find((row) => row.item_code === "WN006-1")?.rate).toBe(7110);
  });

  it("keeps Shopify nets when computed total does not match paid total", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/Pricing%20Rule/PRLE-0026")) {
        return new Response(
          JSON.stringify({ data: { discount_percentage: 10, rate_or_discount: "Discount Percentage" } }),
          { status: 200 },
        );
      }
      if (url.includes("/Pricing%20Rule?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes("/Item%20Price?")) {
        return new Response(
          JSON.stringify({ data: [{ item_code: "WN002-1", price_list_rate: 9950 }] }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });

    const netFallback = [{ item_code: "WN002-1", qty: 1, warehouse: "WH", rate: 9000 }];
    const result = await resolveCouponInvoiceItemRates({
      cfg,
      productItems: [{ item_code: "WN002-1", qty: 1, warehouse: "WH" }],
      netFallbackItems: netFallback,
      pricingRule: "PRLE-0026",
      company: "SupplementVault.lk",
      asOfDate: "2026-10-24",
      shopifyGrandTotal: 5000,
      shippingAmt: 0,
    });

    expect(result.usedBestDiscount).toBe(false);
    expect(result.items).toEqual(netFallback);
  });
});
