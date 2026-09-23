import { describe, expect, it } from "vitest";

import { resolveLocationRopQty, ropMapKey } from "@/lib/item-trends/rop-resolve";

describe("resolveLocationRopQty", () => {
  const map = new Map<string, number>([
    [ropMapKey("ORD04", "gcc"), 25],
    [ropMapKey("ORD04_1", "gcc"), 10],
    [ropMapKey("ORD04_2", "gcc"), 10],
    [ropMapKey("SOLO", "gcc"), 7],
  ]);

  it("returns separate SKU ROP", () => {
    expect(
      resolveLocationRopQty({
        grain: "separate",
        sku: "SOLO",
        commonSkuKey: "SOLO",
        columnKey: "gcc",
        ropBySkuColumn: map,
      }),
    ).toBe(7);
  });

  it("prefers common parent ROP over variants", () => {
    expect(
      resolveLocationRopQty({
        grain: "common",
        sku: "ORD04",
        commonSkuKey: "ORD04",
        columnKey: "gcc",
        ropBySkuColumn: map,
        childSkus: ["ORD04_1", "ORD04_2"],
      }),
    ).toBe(25);
  });

  it("uses unanimous child ROP when parent missing", () => {
    const noParent = new Map<string, number>([
      [ropMapKey("ORD04_1", "gcc"), 10],
      [ropMapKey("ORD04_2", "gcc"), 10],
    ]);
    expect(
      resolveLocationRopQty({
        grain: "common",
        sku: "ORD04",
        commonSkuKey: "ORD04",
        columnKey: "gcc",
        ropBySkuColumn: noParent,
        childSkus: ["ORD04_1", "ORD04_2"],
      }),
    ).toBe(10);
  });

  it("does not sum conflicting child ROPs", () => {
    const conflict = new Map<string, number>([
      [ropMapKey("ORD04_1", "gcc"), 10],
      [ropMapKey("ORD04_2", "gcc"), 12],
    ]);
    expect(
      resolveLocationRopQty({
        grain: "common",
        sku: "ORD04",
        commonSkuKey: "ORD04",
        columnKey: "gcc",
        ropBySkuColumn: conflict,
        childSkus: ["ORD04_1", "ORD04_2"],
      }),
    ).toBeNull();
  });

  it("returns null when missing", () => {
    expect(
      resolveLocationRopQty({
        grain: "separate",
        sku: "MISSING",
        commonSkuKey: "MISSING",
        columnKey: "gcc",
        ropBySkuColumn: map,
      }),
    ).toBeNull();
  });
});
