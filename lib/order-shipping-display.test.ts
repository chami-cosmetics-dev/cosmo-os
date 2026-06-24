import { describe, expect, it } from "vitest";

import {
  buildErpOrderShippingFields,
  mergeOrderShippingDisplay,
  resolveOrderDisplayTotal,
  resolveOrderShippingDisplay,
} from "@/lib/order-shipping-display";

describe("resolveOrderShippingDisplay", () => {
  it("reads ERP shipping rule and tax amount from rawPayload", () => {
    const display = resolveOrderShippingDisplay({
      sourceName: "erpnext",
      rawPayload: {
        shipping_rule: "Veyangoda - DTD",
        taxes: [{ description: "Veyangoda - DTD", tax_amount: 400 }],
      },
    });

    expect(display).toEqual({ label: "Veyangoda - DTD", amount: "400.00" });
  });

  it("prefers stored shippingLines over rawPayload", () => {
    const display = resolveOrderShippingDisplay({
      sourceName: "erpnext",
      totalShipping: "500",
      shippingLines: [{ title: "Colombo - DTD", price: "500", source: "erpnext" }],
      rawPayload: { shipping_rule: "Veyangoda - DTD", taxes: [{ tax_amount: 400 }] },
    });

    expect(display).toEqual({ label: "Colombo - DTD", amount: "500.00" });
  });

  it("uses Shopify shipping line title when present", () => {
    const display = resolveOrderShippingDisplay({
      sourceName: "web",
      totalShipping: "350",
      shippingLines: [{ title: "Standard Shipping", price: "350" }],
    });

    expect(display).toEqual({ label: "Standard Shipping", amount: "350.00" });
  });

  it("hides shipping when FREESP zeroes discounted_price", () => {
    const display = resolveOrderShippingDisplay({
      sourceName: "web",
      totalShipping: "400",
      discountCodes: [
        { code: "SV20", amount: "2700.00" },
        { code: "FREESP", type: "shipping", amount: "400.00" },
      ],
      shippingLines: [
        {
          title: "Shipping Zone B",
          code: "Shipping Zone B",
          price: "400.00",
          discounted_price: "0.00",
        },
      ],
    });

    expect(display).toEqual({ label: null, amount: null });
  });
});

describe("mergeOrderShippingDisplay", () => {
  it("fills missing label and amount from live ERP data", () => {
    expect(
      mergeOrderShippingDisplay(
        { label: null, amount: null },
        { label: "Colombo 13 - DTD", amount: "300.00" },
      ),
    ).toEqual({ label: "Colombo 13 - DTD", amount: "300.00" });
  });

  it("keeps stored values when present", () => {
    expect(
      mergeOrderShippingDisplay(
        { label: "Stored rule", amount: "500.00" },
        { label: "Live rule", amount: "300.00" },
      ),
    ).toEqual({ label: "Stored rule", amount: "500.00" });
  });
});

describe("buildErpOrderShippingFields", () => {
  it("builds shippingLines and totalShipping for ERP webhook", () => {
    const fields = buildErpOrderShippingFields({
      shipping_rule: "Veyangoda - DTD",
      taxes: [{ description: "Veyangoda - DTD", tax_amount: 400 }],
    });

    expect(fields.totalShipping).toBe("400.00");
    expect(fields.shippingLines).toEqual([
      {
        title: "Veyangoda - DTD",
        code: "Veyangoda - DTD",
        price: "400.00",
        source: "erpnext",
      },
    ]);
  });
});

describe("resolveOrderDisplayTotal", () => {
  it("adds shipping when stored total matches discounted subtotal only", () => {
    expect(
      resolveOrderDisplayTotal({
        totalPrice: "10800.00",
        subtotalSale: "10800.00",
        totalShipping: "400.00",
      }),
    ).toBe("11200.00");
  });

  it("keeps stored total when it already includes shipping", () => {
    expect(
      resolveOrderDisplayTotal({
        totalPrice: "11200.00",
        subtotalSale: "10800.00",
        totalShipping: "400.00",
      }),
    ).toBe("11200.00");
  });

  it("returns stored total when there is no shipping", () => {
    expect(
      resolveOrderDisplayTotal({
        totalPrice: "10800.00",
        subtotalSale: "10800.00",
        totalShipping: null,
      }),
    ).toBe("10800.00");
  });
});
