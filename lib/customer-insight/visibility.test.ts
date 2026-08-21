import { describe, expect, it } from "vitest";

import { toLimitedInsightDto } from "@/lib/customer-insight/visibility";
import type { CustomerInsightDto } from "@/lib/customer-insight/types";

const sampleOwner: CustomerInsightDto = {
  visibility: "owner",
  assignedMerchant: "Dinuli",
  loyalty: {
    key: "gold",
    label: "Gold",
    code: "loyalcs",
    lifetimeTotal: 100_000,
    currency: "LKR",
    thresholds: { goldMin: 100_000, platinumMin: 250_000 },
  },
  contact: {
    id: "c1",
    name: "Cust",
    phoneNumber: "077",
    phones: ["077"],
    email: "a@b.com",
    gender: "Female",
    language: "Sinhala",
    address: "Colombo",
    city: "Colombo",
    birthYear: 1990,
    birthMonth: 8,
    birthDay: 1,
    assignedMerchant: "Dinuli",
    category: "Interested",
    lastPurchaseAt: "2026-01-15T00:00:00.000Z",
    removedEmails: [],
  },
  frequency: {
    orderCount: 2,
    firstOrderAt: null,
    lastOrderAt: null,
    avgDaysBetweenOrders: null,
  },
  topItems: [{ name: "X", quantity: 1, spend: 10 }],
  series: [{ month: "2026-01", spend: 10, orderCount: 1 }],
  chartsAvailable: true,
  progressBar: {
    currentTotal: 100_000,
    goldMin: 100_000,
    platinumMin: 250_000,
    amountToNext: 150_000,
    tier: "gold",
  },
  lastContactedAt: "2026-01-01T00:00:00.000Z",
  canEditProfile: true,
  canMarkContacted: true,
  invoices: [
    {
      id: "order:1",
      source: "order",
      date: "2026-01-01T00:00:00.000Z",
      reference: "SO-1",
      secondaryLabel: null,
      status: "paid",
      financialStatus: "paid",
      fulfillmentStatus: null,
      amount: 10,
      currency: "LKR",
      includedInLoyaltyTotal: true,
      orderId: "o1",
      lineItems: [
        {
          id: "li1",
          productTitle: "Item",
          variantTitle: null,
          sku: null,
          quantity: 1,
          price: "10",
        },
      ],
    },
  ],
  invoicePagination: { page: 1, pageSize: 25, total: 1 },
};

describe("toLimitedInsightDto", () => {
  it("keeps total, invoices headers, assigned merchant only", () => {
    const limited = toLimitedInsightDto(sampleOwner);
    expect(limited.visibility).toBe("limited");
    expect(limited.assignedMerchant).toBe("Dinuli");
    expect(limited.loyalty.lifetimeTotal).toBe(100_000);
    expect(limited.invoices[0]?.lineItems).toEqual([]);
    expect(limited.contact).toBeUndefined();
    expect(limited.progressBar).toBeUndefined();
    expect(limited.topItems).toBeUndefined();
    expect(limited.series).toBeUndefined();
    expect(limited.lastContactedAt).toBeUndefined();
    expect(limited.canEditProfile).toBeUndefined();
  });

  it("keeps spend-based Gold/Platinum eligibility on limited search view", () => {
    const withEligibility: CustomerInsightDto = {
      ...sampleOwner,
      loyaltyEligibility: {
        suggestedTier: "platinum",
        kind: "upgrade",
        currentAssigned: "gold",
      },
    };
    const limited = toLimitedInsightDto(withEligibility);
    expect(limited.loyaltyEligibility).toEqual({
      suggestedTier: "platinum",
      kind: "upgrade",
      currentAssigned: "gold",
    });
  });
});
