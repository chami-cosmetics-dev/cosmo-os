import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  remapShopifyDiscountCodeForErpPayment,
  resolveErpSalesInvoiceCouponFields,
} from "@/lib/erp-coupon-resolve";

const cfg = {
  baseUrl: "https://erp.example.com",
  apiKey: "key",
  apiSecret: "secret",
};

describe("resolveErpSalesInvoiceCouponFields", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps LOYALCS2 discount and MER merchant when both exist in ERP", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/Coupon%20Code/LOYALCS2")) {
        return new Response(JSON.stringify({ data: { name: "LOYALCS2" } }), { status: 200 });
      }
      if (url.includes("/Sales%20Person/MER102")) {
        return new Response("{}", { status: 404 });
      }
      if (url.includes("/Sales%20Person?")) {
        return new Response(
          JSON.stringify({ data: [{ name: "MER102-Maheshi Soysa" }] }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });

    const result = await resolveErpSalesInvoiceCouponFields(cfg, {
      sourceName: "web",
      discountCodes: [
        { code: "MER102", amount: 0 },
        { code: "LOYALCS2", amount: 2925 },
      ],
    });

    expect(result.couponCode).toBe("LOYALCS2");
    expect(result.discountCodeLabel).toBe("LOYALCS2");
    expect(result.merchantSalesPerson).toBe("MER102-Maheshi Soysa");
  });

  it("keeps discount label when coupon is missing in ERP", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 404 }));

    const result = await resolveErpSalesInvoiceCouponFields(cfg, {
      sourceName: "web",
      discountCodes: [{ code: "LOYALCS2", amount: 2925 }],
    });

    expect(result.couponCode).toBeNull();
    expect(result.discountCodeLabel).toBe("LOYALCS2");
  });

  it("maps CODHO05 to SPVL5 for Koko when resolving ERP coupon fields", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/Coupon%20Code/SPVL5")) {
        return new Response(JSON.stringify({ data: { name: "SPVL5" } }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });

    const result = await resolveErpSalesInvoiceCouponFields(cfg, {
      sourceName: "web",
      discountCodes: [{ code: "CODHO05", amount: 500 }],
      paymentGatewayNames: ["Koko: Buy Now Pay Later"],
    });

    expect(result.couponCode).toBe("SPVL5");
    expect(result.discountCodeLabel).toBe("CODHO05");
  });
});

describe("remapShopifyDiscountCodeForErpPayment", () => {
  it("maps CODHO05 to SPVL5 for Koko", () => {
    expect(
      remapShopifyDiscountCodeForErpPayment("CODHO05", null, ["Koko: Buy Now Pay Later"]),
    ).toBe("SPVL5");
  });

  it("keeps CODHO05 for COD orders", () => {
    expect(
      remapShopifyDiscountCodeForErpPayment("CODHO05", null, ["Cash on Delivery (COD)"]),
    ).toBe("CODHO05");
  });

  it("leaves non-CODHO coupons unchanged", () => {
    expect(remapShopifyDiscountCodeForErpPayment("SV20", null, ["Koko: Buy Now Pay Later"])).toBe(
      "SV20",
    );
  });
});
