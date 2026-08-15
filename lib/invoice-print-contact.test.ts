import { describe, expect, it } from "vitest";

import {
  getPhoneFromAddress,
  resolveInvoicePrintPhones,
  withAddressPhone,
} from "@/lib/invoice-print-contact";

describe("getPhoneFromAddress", () => {
  it("reads string and numeric phone", () => {
    expect(getPhoneFromAddress({ phone: "0771234567" })).toBe("0771234567");
    expect(getPhoneFromAddress({ phone: 777531452 })).toBe("777531452");
  });

  it("returns empty when phone missing", () => {
    expect(getPhoneFromAddress({ name: "Ruwani" })).toBe("");
    expect(getPhoneFromAddress(null)).toBe("");
  });
});

describe("withAddressPhone", () => {
  it("keeps existing address phone", () => {
    const addr = { name: "A", phone: "011" };
    expect(withAddressPhone(addr, "077")).toEqual(addr);
  });

  it("adds phone when address has none", () => {
    expect(withAddressPhone({ name: "Ruwani", address1: "No 120" }, "777531452")).toEqual({
      name: "Ruwani",
      address1: "No 120",
      phone: "777531452",
    });
  });

  it("creates a phone-only address when address is missing", () => {
    expect(withAddressPhone(null, "777531452")).toEqual({ phone: "777531452" });
  });
});

describe("resolveInvoicePrintPhones", () => {
  it("fills shipping/billing phone from ERP contact_mobile when address has none", () => {
    const result = resolveInvoicePrintPhones({
      customerPhone: "777531452",
      shippingAddress: {
        name: "Ruwani Bandaranayake",
        address1: "No 120, Seagull court residencies",
        country: "Sri Lanka",
      },
      billingAddress: null,
      rawPayload: { contact_mobile: "777531452" },
    });

    expect(result.resolvedPhone).toBe("777531452");
    expect(result.shippingPhone).toBe("777531452");
    expect(result.billingPhone).toBe("777531452");
    expect(result.shippingAddress).toMatchObject({
      name: "Ruwani Bandaranayake",
      phone: "777531452",
    });
    expect(result.billingAddress).toEqual({ phone: "777531452" });
  });

  it("reads contact_mobile from raw payload when customerPhone is empty", () => {
    const result = resolveInvoicePrintPhones({
      customerPhone: null,
      shippingAddress: { name: "Ruwani" },
      rawPayload: { contact_mobile: "777531452" },
    });

    expect(result.resolvedPhone).toBe("777531452");
    expect(result.shippingPhone).toBe("777531452");
  });

  it("prefers address phone over customerPhone", () => {
    const result = resolveInvoicePrintPhones({
      customerPhone: "0770000000",
      shippingAddress: { name: "Ship", phone: "0771111111" },
      billingAddress: { name: "Bill", phone: "0772222222" },
    });

    expect(result.shippingPhone).toBe("0771111111");
    expect(result.billingPhone).toBe("0772222222");
  });
});
