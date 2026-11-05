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
  it("includes completed sales and voided/cancelled branches", () => {
    const where = customerInsightPurchaseMatchOrderWhere();
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fulfillmentStage: expect.objectContaining({
            in: expect.arrayContaining([
              "delivery_complete",
              "invoice_complete",
            ]),
          }),
        }),
        { cancelledAt: { not: null } },
        { financialStatus: { in: ["voided", "void"] } },
      ])
    );
  });
});
