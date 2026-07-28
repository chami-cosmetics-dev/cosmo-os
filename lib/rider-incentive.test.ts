import { describe, expect, it } from "vitest";

import {
  aggregateRiderIncentives,
  isIncentiveEligibleOrder,
  shippingIncentiveAmount,
} from "@/lib/rider-incentive";

describe("shippingIncentiveAmount", () => {
  it("treats null/negative as zero", () => {
    expect(shippingIncentiveAmount(null).toString()).toBe("0");
    expect(shippingIncentiveAmount(400).toString()).toBe("400");
  });
});

describe("isIncentiveEligibleOrder", () => {
  it("excludes voided orders", () => {
    expect(isIncentiveEligibleOrder("paid")).toBe(true);
    expect(isIncentiveEligibleOrder("voided")).toBe(false);
  });
});

describe("aggregateRiderIncentives", () => {
  it("sums shipping for completed eligible rows", () => {
    const rows = aggregateRiderIncentives([
      {
        riderId: "r1",
        riderName: "A",
        knownName: null,
        totalShipping: 200,
        financialStatus: "paid",
      },
      {
        riderId: "r1",
        riderName: "A",
        knownName: null,
        totalShipping: 350,
        financialStatus: "paid",
      },
      {
        riderId: "r1",
        riderName: "A",
        knownName: null,
        totalShipping: 100,
        financialStatus: "voided",
      },
    ]);
    expect(rows).toEqual([
      {
        riderId: "r1",
        name: "A",
        knownName: null,
        completedCount: 2,
        incentiveTotal: "550.00",
      },
    ]);
  });
});
