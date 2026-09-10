import { describe, expect, it } from "vitest";

import { resolveCustomerPhone } from "@/lib/order-sms-resolvers";

describe("resolveCustomerPhone", () => {
  it("prefers order.customerPhone", () => {
    expect(
      resolveCustomerPhone({
        customerPhone: "0771111111",
        erpnextCustomerId: "0772222222",
        shippingAddress: { phone: "0773333333" },
      }),
    ).toBe("0771111111");
  });

  it("ignores ERP None placeholders", () => {
    expect(
      resolveCustomerPhone({
        customerPhone: "None",
        erpnextCustomerId: "0774223062",
      }),
    ).toBe("0774223062");
  });

  it("reads numeric address phones", () => {
    expect(
      resolveCustomerPhone({
        customerPhone: null,
        shippingAddress: { name: "Ruwani", phone: 777531452 },
      }),
    ).toBe("777531452");
  });

  it("uses ERP contact_mobile from payload", () => {
    expect(
      resolveCustomerPhone({
        customerPhone: null,
        rawPayload: { contact_mobile: "0771234567" },
      }),
    ).toBe("0771234567");
  });

  it("uses ERP customer id when it is a phone (Vault POS)", () => {
    expect(
      resolveCustomerPhone({
        customerPhone: null,
        erpnextCustomerId: "0774223062",
        rawPayload: { customer: "0774223062", contact_mobile: null },
      }),
    ).toBe("0774223062");
  });

  it("reads ERP customer string from nested data payload", () => {
    expect(
      resolveCustomerPhone({
        customerPhone: null,
        rawPayload: {
          data: {
            customer: "0717106114",
            contact_mobile: "None",
          },
        },
      }),
    ).toBe("0717106114");
  });

  it("does not treat numeric ERP customer codes as phones", () => {
    expect(
      resolveCustomerPhone({
        customerPhone: null,
        erpnextCustomerId: "0000717",
        rawPayload: { customer: "0000717" },
      }),
    ).toBeUndefined();
  });

  it("still reads Shopify customer.phone objects", () => {
    expect(
      resolveCustomerPhone({
        customerPhone: null,
        rawPayload: {
          customer: { phone: "+94771234567" },
        },
      }),
    ).toBe("+94771234567");
  });
});
