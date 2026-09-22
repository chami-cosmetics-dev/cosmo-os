import { describe, expect, it } from "vitest";

import { excludeSkusFromPriorities } from "@/lib/stock-price-missing/scan";

describe("excludeSkusFromPriorities", () => {
  it("drops Discontinue on that ERP", () => {
    const bySku = new Map<string, string | null>([
      ["A-1", "Discontinue"],
      ["B-1", "Continue"],
      ["C-1", "Vat"],
    ]);
    const out = excludeSkusFromPriorities({
      skus: ["A-1", "B-1", "C-1"],
      bySku,
      dropDiscontinue: true,
      dropVat: false,
    });
    expect([...out].sort()).toEqual(["A-1"]);
  });

  it("ERP2 also drops Vat", () => {
    const bySku = new Map<string, string | null>([
      ["A-1", "Discontinue"],
      ["B-1", "Continue"],
      ["C-1", "Vat"],
    ]);
    const out = excludeSkusFromPriorities({
      skus: ["A-1", "B-1", "C-1"],
      bySku,
      dropDiscontinue: true,
      dropVat: true,
    });
    expect([...out].sort()).toEqual(["A-1", "C-1"]);
  });
});
