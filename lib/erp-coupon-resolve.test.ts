import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { resolveErpSalesInvoiceCouponFields } from "@/lib/erp-coupon-resolve";

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
});
