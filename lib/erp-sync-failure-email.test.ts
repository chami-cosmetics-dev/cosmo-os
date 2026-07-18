import { describe, expect, it } from "vitest";

import {
  decideErpSyncFailureEmailSkip,
  groupTotalsByCurrency,
  normalizeEmailRecipientList,
  resolveFailureReportAmounts,
} from "@/lib/erp-sync-failure-email";

describe("normalizeEmailRecipientList", () => {
  it("normalizes, dedupes, and validates emails", () => {
    expect(
      normalizeEmailRecipientList([
        "Buddhima.Cosmetics@outlook.com",
        "buddhima.cosmetics@outlook.com",
        "not-an-email",
        " ops@example.com ",
      ]),
    ).toEqual(["buddhima.cosmetics@outlook.com", "ops@example.com"]);
  });

  it("parses multiline strings", () => {
    expect(
      normalizeEmailRecipientList("a@example.com\nb@example.com;c@example.com"),
    ).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
  });
});

describe("decideErpSyncFailureEmailSkip", () => {
  it("skips disabled, empty recipients, no failures, and already-sent cron", () => {
    expect(
      decideErpSyncFailureEmailSkip({
        enabled: false,
        recipients: ["a@b.com"],
        orderCount: 2,
        alreadySent: false,
        source: "cron",
      }),
    ).toBe("skipped_disabled");

    expect(
      decideErpSyncFailureEmailSkip({
        enabled: true,
        recipients: [],
        orderCount: 2,
        alreadySent: false,
        source: "cron",
      }),
    ).toBe("skipped_no_recipients");

    expect(
      decideErpSyncFailureEmailSkip({
        enabled: true,
        recipients: ["a@b.com"],
        orderCount: 0,
        alreadySent: false,
        source: "cron",
      }),
    ).toBe("skipped_no_failures");

    expect(
      decideErpSyncFailureEmailSkip({
        enabled: true,
        recipients: ["a@b.com"],
        orderCount: 2,
        alreadySent: true,
        source: "cron",
      }),
    ).toBe("skipped_already_sent");
  });

  it("allows manual/test force past already-sent", () => {
    expect(
      decideErpSyncFailureEmailSkip({
        enabled: true,
        recipients: ["a@b.com"],
        orderCount: 2,
        alreadySent: true,
        force: true,
        source: "manual",
      }),
    ).toBeNull();
  });
});

describe("resolveFailureReportAmounts", () => {
  it("computes including, shipping, and excluding totals", () => {
    expect(
      resolveFailureReportAmounts({
        totalPrice: "11500.00",
        totalShipping: "500.00",
        shippingLines: [{ price: "500.00", discounted_price: "500.00" }],
      }),
    ).toEqual({ amountIncl: 11500, shipping: 500, amountExcl: 11000 });
  });

  it("treats free-shipping coupons as zero shipping", () => {
    expect(
      resolveFailureReportAmounts({
        totalPrice: "10000",
        totalShipping: "500",
        shippingLines: [{ price: "500" }],
        discountCodes: [{ code: "FREESP", type: "shipping" }],
      }),
    ).toEqual({ amountIncl: 10000, shipping: 0, amountExcl: 10000 });
  });
});

describe("groupTotalsByCurrency", () => {
  it("groups and does not mix currencies", () => {
    expect(
      groupTotalsByCurrency([
        { currency: "LKR", amountIncl: 100, shipping: 10, amountExcl: 90 },
        { currency: "USD", amountIncl: 20, shipping: 2, amountExcl: 18 },
        { currency: "LKR", amountIncl: 50, shipping: 5, amountExcl: 45 },
      ]),
    ).toEqual([
      { currency: "LKR", count: 2, sumIncl: 150, sumShipping: 15, sumExcl: 135 },
      { currency: "USD", count: 1, sumIncl: 20, sumShipping: 2, sumExcl: 18 },
    ]);
  });
});
