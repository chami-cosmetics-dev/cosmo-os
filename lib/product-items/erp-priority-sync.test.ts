import { describe, expect, it } from "vitest";

import {
  normalizeSkuKey,
  resolveErpSlots,
} from "@/lib/product-items/erp-priority-sync";

describe("normalizeSkuKey", () => {
  it("trims and uppercases", () => {
    expect(normalizeSkuKey("  acn03_1  ")).toBe("ACN03_1");
  });
});

describe("resolveErpSlots", () => {
  it("matches label ERP1/ERP2 including underscores", () => {
    const slots = resolveErpSlots([
      { id: "a", label: "Trading" },
      { id: "b", label: "ERP_2 - Main" },
      { id: "c", label: "ERP_1 - Main" },
    ]);
    expect(slots.erp1?.id).toBe("c");
    expect(slots.erp2?.id).toBe("b");
  });

  it("falls back to order", () => {
    const slots = resolveErpSlots([
      { id: "first", label: "Alpha" },
      { id: "second", label: "Beta" },
    ]);
    expect(slots.erp1?.id).toBe("first");
    expect(slots.erp2?.id).toBe("second");
  });
});
