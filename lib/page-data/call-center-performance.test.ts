import { describe, expect, it } from "vitest";

import { labelCallCenterPerformanceMerchant } from "@/lib/page-data/call-center-performance";

describe("labelCallCenterPerformanceMerchant", () => {
  it("credits the user display name, not a drifted stored name", () => {
    expect(
      labelCallCenterPerformanceMerchant({
        user: { knownName: "Ishadi", name: "Ishadi Perera", email: "i@x.com" },
        orphanName: "Ishadi Cosmetics",
      }),
    ).toBe("Ishadi");
  });

  it("falls back to stored name when merchantId is missing", () => {
    expect(
      labelCallCenterPerformanceMerchant({
        user: null,
        orphanName: "Ishadi",
      }),
    ).toBe("Ishadi");
  });

  it("uses Unknown when nothing is stored", () => {
    expect(
      labelCallCenterPerformanceMerchant({
        user: null,
        orphanName: null,
      }),
    ).toBe("Unknown");
  });
});
