import { describe, expect, it } from "vitest";

import {
  indexPurchaseAggregatesByPhoneKey,
  purchaseSummaryForPhone,
} from "@/lib/contacts/purchase-summary-export";

describe("purchase summary phone index", () => {
  it("merges the same number stored in local and +94 forms", () => {
    const byKey = indexPurchaseAggregatesByPhoneKey([
      {
        customerPhone: "0771234567",
        orderCount: 2,
        totalSpent: 1000,
        lastOrderAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        customerPhone: "+94771234567",
        orderCount: 1,
        totalSpent: 250.5,
        lastOrderAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    ]);

    const summary = purchaseSummaryForPhone(byKey, "94771234567");
    expect(summary).toEqual({
      orderCount: 3,
      totalSpent: 1250.5,
      lastOrderAt: new Date("2026-03-01T00:00:00.000Z"),
    });
  });

  it("does not merge distinct numbers", () => {
    const byKey = indexPurchaseAggregatesByPhoneKey([
      {
        customerPhone: "0771234567",
        orderCount: 1,
        totalSpent: 10,
        lastOrderAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        customerPhone: "0779999999",
        orderCount: 4,
        totalSpent: 40,
        lastOrderAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ]);

    expect(purchaseSummaryForPhone(byKey, "0771234567")?.orderCount).toBe(1);
    expect(purchaseSummaryForPhone(byKey, "0779999999")?.orderCount).toBe(4);
  });

  it("returns undefined when the contact has no matching orders", () => {
    const byKey = indexPurchaseAggregatesByPhoneKey([
      {
        customerPhone: "0771234567",
        orderCount: 1,
        totalSpent: 10,
        lastOrderAt: null,
      },
    ]);
    expect(purchaseSummaryForPhone(byKey, "0710000000")).toBeUndefined();
    expect(purchaseSummaryForPhone(byKey, null)).toBeUndefined();
  });
});
