import { describe, expect, it } from "vitest";

import { formatBusinessOrderNumber, formatOrderSecondaryLabel } from "@/lib/order-display-label";

describe("formatBusinessOrderNumber", () => {
  it("prefers full name over short order number", () => {
    expect(
      formatBusinessOrderNumber({
        orderNumber: "17455",
        name: "60017455",
        shopifyOrderId: "gid",
      })
    ).toBe("60017455");
  });

  it("falls back to orderNumber then shopify id", () => {
    expect(formatBusinessOrderNumber({ orderNumber: "17455", shopifyOrderId: "gid" })).toBe("17455");
    expect(formatBusinessOrderNumber({ shopifyOrderId: "gid-9" })).toBe("gid-9");
    expect(formatBusinessOrderNumber({})).toBe("—");
  });
});

describe("formatOrderSecondaryLabel", () => {
  it("never shows a secondary label for order rows", () => {
    expect(formatOrderSecondaryLabel({ orderNumber: "17455", name: "60017455" })).toBeNull();
    expect(formatOrderSecondaryLabel({ orderNumber: "1234", name: "SV100-1" })).toBeNull();
  });
});
