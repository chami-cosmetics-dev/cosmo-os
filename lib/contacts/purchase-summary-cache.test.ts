import { describe, expect, it } from "vitest";

import {
  purchaseSummaryForContact,
  type PurchaseSummaryIndexes,
} from "@/lib/contacts/purchase-summary-export";

/**
 * Cache refresh writes the same attributed summary export used to live-compute.
 * Keep this mapping explicit so export columns stay in sync with refresh.
 */
function cacheRowFromIndexes(
  indexes: PurchaseSummaryIndexes,
  contact: {
    contactId: string;
    phoneNumber?: string | null;
    email?: string | null;
    aliasPhones?: string[];
    aliasEmails?: string[];
  }
) {
  const summary = purchaseSummaryForContact(indexes, contact);
  return {
    orderCount: summary?.orderCount ?? 0,
    totalSpent: summary?.totalSpent ?? 0,
    lastOrderAt: summary?.lastOrderAt ?? null,
  };
}

describe("purchase summary cache row mapping", () => {
  it("stores zeros when contact has no matching purchases", () => {
    const indexes: PurchaseSummaryIndexes = {
      byPhone: new Map(),
      byEmail: new Map(),
      byContactId: new Map(),
    };
    expect(
      cacheRowFromIndexes(indexes, {
        contactId: "c1",
        phoneNumber: "0771111111",
      })
    ).toEqual({
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
    });
  });

  it("stores phone + adapt totals used by export", () => {
    const lastOrderAt = new Date("2026-04-01T00:00:00.000Z");
    const indexes: PurchaseSummaryIndexes = {
      byPhone: new Map([
        [
          "94771111111",
          {
            orderCount: 2,
            totalSpent: 1500,
            lastOrderAt: new Date("2026-03-01T00:00:00.000Z"),
          },
        ],
      ]),
      byEmail: new Map(),
      byContactId: new Map([
        [
          "c1",
          {
            orderCount: 1,
            totalSpent: 250,
            lastOrderAt,
          },
        ],
      ]),
    };

    expect(
      cacheRowFromIndexes(indexes, {
        contactId: "c1",
        phoneNumber: "0771111111",
      })
    ).toEqual({
      orderCount: 3,
      totalSpent: 1750,
      lastOrderAt,
    });
  });
});
