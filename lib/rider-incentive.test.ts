import { describe, expect, it } from "vitest";

import {
  aggregateRiderIncentives,
  isIncentiveEligibleOrder,
  normalizeIncentiveAmount,
  shippingIncentiveAmount,
} from "@/lib/rider-incentive";

describe("shippingIncentiveAmount", () => {
  it("treats null/negative as zero", () => {
    expect(shippingIncentiveAmount(null).toString()).toBe("0");
    expect(shippingIncentiveAmount(400).toString()).toBe("400");
  });
});

describe("normalizeIncentiveAmount", () => {
  it("treats null/negative as zero", () => {
    expect(normalizeIncentiveAmount(null).toString()).toBe("0");
    expect(normalizeIncentiveAmount(300).toString()).toBe("300");
  });
});

describe("isIncentiveEligibleOrder", () => {
  it("excludes voided orders", () => {
    expect(isIncentiveEligibleOrder("paid")).toBe(true);
    expect(isIncentiveEligibleOrder("voided")).toBe(false);
  });
});

describe("aggregateRiderIncentives", () => {
  it("sums resolved rider incentive amounts for eligible rows", () => {
    const rows = aggregateRiderIncentives([
      {
        riderId: "r1",
        riderName: "A",
        knownName: null,
        incentiveAmount: 300,
        financialStatus: "paid",
      },
      {
        riderId: "r1",
        riderName: "A",
        knownName: null,
        incentiveAmount: 400,
        financialStatus: "paid",
      },
      {
        riderId: "r1",
        riderName: "A",
        knownName: null,
        incentiveAmount: 100,
        financialStatus: "voided",
      },
    ]);
    expect(rows).toEqual([
      {
        riderId: "r1",
        name: "A",
        knownName: null,
        completedCount: 2,
        incentiveTotal: "700.00",
        unmatchedCount: 0,
      },
    ]);
  });

  it("counts unmatched deliveries when matched is false", () => {
    const rows = aggregateRiderIncentives([
      {
        riderId: "r1",
        riderName: "A",
        knownName: null,
        incentiveAmount: 0,
        matched: false,
        financialStatus: "paid",
      },
      {
        riderId: "r1",
        riderName: "A",
        knownName: null,
        incentiveAmount: 300,
        matched: true,
        financialStatus: "paid",
      },
    ]);
    expect(rows[0]?.unmatchedCount).toBe(1);
    expect(rows[0]?.incentiveTotal).toBe("300.00");
  });
});
