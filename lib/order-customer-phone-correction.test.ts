import { describe, expect, it } from "vitest";

import {
  buildOrderCustomerPhoneCorrectionData,
  resolveCorrectedOrderCustomerPhone,
} from "@/lib/order-customer-phone-correction";

describe("resolveCorrectedOrderCustomerPhone", () => {
  it("accepts and canonicalizes valid phones", () => {
    expect(resolveCorrectedOrderCustomerPhone("+94 771 234 567")).toEqual({
      ok: true,
      phone: "0771234567",
    });
  });

  it("rejects empty and non-SL numbers", () => {
    expect(resolveCorrectedOrderCustomerPhone("").ok).toBe(false);
    expect(resolveCorrectedOrderCustomerPhone("447500981058").ok).toBe(false);
    expect(resolveCorrectedOrderCustomerPhone("5513238858").ok).toBe(false);
  });
});

describe("buildOrderCustomerPhoneCorrectionData", () => {
  it("patches order columns and Shopify rawPayload phone fields", () => {
    const data = buildOrderCustomerPhoneCorrectionData({
      phone: "0771234567",
      shippingAddress: { address1: "A", phone: "5513238858" },
      billingAddress: { phone: "old" },
      rawPayload: {
        phone: "5513238858",
        billing_address: { phone: "5513238858", city: "Colombo" },
        shipping_address: { phone: "5513238858" },
        customer: { phone: "5513238858", email: "a@b.com" },
        id: 1,
      },
    });

    expect(data.customerPhone).toBe("0771234567");
    expect(data.shippingAddress).toEqual({ address1: "A", phone: "0771234567" });
    expect(data.billingAddress).toEqual({ phone: "0771234567" });
    expect(data.rawPayload).toEqual({
      phone: "0771234567",
      billing_address: { phone: "0771234567", city: "Colombo" },
      shipping_address: { phone: "0771234567" },
      customer: { phone: "0771234567", email: "a@b.com" },
      id: 1,
    });
  });

  it("skips missing address/rawPayload objects", () => {
    const data = buildOrderCustomerPhoneCorrectionData({
      phone: "0771234567",
      shippingAddress: null,
      billingAddress: null,
      rawPayload: null,
    });
    expect(data).toEqual({ customerPhone: "0771234567" });
  });
});
