import { describe, expect, it } from "vitest";

import {
  indexPurchaseAggregatesByContactId,
  indexPurchaseAggregatesByEmail,
  indexPurchaseAggregatesByPhoneKey,
  purchaseSummaryForContact,
  purchaseSummaryForPhone,
  type PurchaseSummaryIndexes,
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

describe("purchase summary for contact", () => {
  const emptyIndexes = (): PurchaseSummaryIndexes => ({
    byPhone: new Map(),
    byEmail: new Map(),
    byContactId: new Map(),
  });

  it("matches email-only contacts via order email aggregates", () => {
    const indexes: PurchaseSummaryIndexes = {
      ...emptyIndexes(),
      byEmail: indexPurchaseAggregatesByEmail([
        {
          customerEmail: "buyer@example.com",
          orderCount: 2,
          totalSpent: 500,
          lastOrderAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ]),
    };

    const summary = purchaseSummaryForContact(indexes, {
      contactId: "c1",
      email: "Buyer@Example.com",
      phoneNumber: null,
    });

    expect(summary).toEqual({
      orderCount: 2,
      totalSpent: 500,
      lastOrderAt: new Date("2026-04-01T00:00:00.000Z"),
    });
  });

  it("merges Adapt history onto email-only contacts", () => {
    const indexes: PurchaseSummaryIndexes = {
      ...emptyIndexes(),
      byEmail: indexPurchaseAggregatesByEmail([
        {
          customerEmail: "buyer@example.com",
          orderCount: 1,
          totalSpent: 100,
          lastOrderAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]),
      byContactId: indexPurchaseAggregatesByContactId([
        {
          contactId: "c1",
          orderCount: 3,
          totalSpent: 900,
          lastOrderAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ]),
    };

    expect(
      purchaseSummaryForContact(indexes, {
        contactId: "c1",
        email: "buyer@example.com",
        phoneNumber: null,
      })
    ).toEqual({
      orderCount: 4,
      totalSpent: 1000,
      lastOrderAt: new Date("2026-05-01T00:00:00.000Z"),
    });
  });

  it("does not use email match when contact has a phone", () => {
    const indexes: PurchaseSummaryIndexes = {
      ...emptyIndexes(),
      byEmail: indexPurchaseAggregatesByEmail([
        {
          customerEmail: "buyer@example.com",
          orderCount: 5,
          totalSpent: 999,
          lastOrderAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      ]),
    };

    expect(
      purchaseSummaryForContact(indexes, {
        contactId: "c1",
        email: "buyer@example.com",
        phoneNumber: "0771234567",
      })
    ).toBeUndefined();
  });

  it("uses alias phone for Cosmo order match", () => {
    const indexes: PurchaseSummaryIndexes = {
      ...emptyIndexes(),
      byPhone: indexPurchaseAggregatesByPhoneKey([
        {
          customerPhone: "0779999999",
          orderCount: 1,
          totalSpent: 50,
          lastOrderAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ]),
    };

    expect(
      purchaseSummaryForContact(indexes, {
        contactId: "c1",
        phoneNumber: "0771111111",
        aliasPhones: ["0779999999"],
      })?.totalSpent
    ).toBe(50);
  });
});
