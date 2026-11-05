import { describe, expect, it } from "vitest";

import { addFilterMatchSpend } from "@/lib/customer-insight/filter-match-spend";
import { customerInsightPurchaseMatchOrderWhere } from "@/lib/customer-insight/lifetime-total";

describe("addFilterMatchSpend", () => {
  it("keeps voided matches at 0 spend", () => {
    const map = new Map<string, number>();
    addFilterMatchSpend(map, "c1", 0);
    expect(map.get("c1")).toBe(0);
  });

  it("sums positive spend and ignores later zero", () => {
    const map = new Map<string, number>();
    addFilterMatchSpend(map, "c1", 100);
    addFilterMatchSpend(map, "c1", 0);
    expect(map.get("c1")).toBe(100);
  });
});

describe("customerInsightPurchaseMatchOrderWhere", () => {
  it("does not gate by fulfillment or financial status", () => {
    expect(customerInsightPurchaseMatchOrderWhere()).toEqual({});
  });
});
