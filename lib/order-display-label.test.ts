import { describe, expect, it } from "vitest";

import { formatBusinessOrderNumber, formatOrderSecondaryLabel } from "@/lib/order-display-label";

describe("formatBusinessOrderNumber", () => {
  it("prefers orderNumber over name", () => {
    expect(
      formatBusinessOrderNumber({
        orderNumber: "1234",
        name: "#1234",
        shopifyOrderId: "gid",
      })
    ).toBe("1234");
  });

  it("falls back to name then shopify id", () => {
    expect(formatBusinessOrderNumber({ name: "SI-1", shopifyOrderId: "gid" })).toBe("SI-1");
    expect(formatBusinessOrderNumber({ shopifyOrderId: "gid-9" })).toBe("gid-9");
    expect(formatBusinessOrderNumber({})).toBe("—");
  });
});

describe("formatOrderSecondaryLabel", () => {
  it("returns name when it differs from orderNumber", () => {
    expect(
      formatOrderSecondaryLabel({ orderNumber: "1234", name: "SV100-1" })
    ).toBe("SV100-1");
  });

  it("returns null when name matches order number style", () => {
    expect(formatOrderSecondaryLabel({ orderNumber: "1234", name: "#1234" })).toBeNull();
    expect(formatOrderSecondaryLabel({ orderNumber: "1234", name: "1234" })).toBeNull();
  });
});
