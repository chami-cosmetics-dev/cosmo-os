import { describe, expect, it } from "vitest";

import {
  classifyPurchaseRecencyBucket,
  daysSinceLastPurchaseYmd,
  recencyBucketToLastPurchaseRange,
} from "@/lib/customer-insight/merchant-monitoring-recency";

const AS_OF = "2026-08-29";

describe("classifyPurchaseRecencyBucket", () => {
  it("never when no last purchase", () => {
    expect(classifyPurchaseRecencyBucket(null, AS_OF)).toBe("never");
  });

  it("today when same calendar day", () => {
    expect(
      classifyPurchaseRecencyBucket(new Date("2026-08-29T10:00:00+05:30"), AS_OF)
    ).toBe("today");
  });

  it("1–30 band boundaries", () => {
    expect(
      classifyPurchaseRecencyBucket(new Date("2026-08-28T12:00:00+05:30"), AS_OF)
    ).toBe("d1_30");
    expect(
      classifyPurchaseRecencyBucket(new Date("2026-07-30T12:00:00+05:30"), AS_OF)
    ).toBe("d1_30");
    expect(
      classifyPurchaseRecencyBucket(new Date("2026-07-29T12:00:00+05:30"), AS_OF)
    ).toBe("d31_90");
  });

  it("31–90 and 91–180 bands", () => {
    expect(
      classifyPurchaseRecencyBucket(new Date("2026-06-01T12:00:00+05:30"), AS_OF)
    ).toBe("d31_90");
    expect(
      classifyPurchaseRecencyBucket(new Date("2026-05-01T12:00:00+05:30"), AS_OF)
    ).toBe("d91_180");
  });

  it("181–365 and 365+ bands", () => {
    expect(
      classifyPurchaseRecencyBucket(new Date("2025-12-01T12:00:00+05:30"), AS_OF)
    ).toBe("d181_365");
    expect(
      classifyPurchaseRecencyBucket(new Date("2024-01-01T12:00:00+05:30"), AS_OF)
    ).toBe("d365_plus");
  });
});

describe("daysSinceLastPurchaseYmd", () => {
  it("returns null without purchase", () => {
    expect(daysSinceLastPurchaseYmd(null, AS_OF)).toBeNull();
  });
});

describe("recencyBucketToLastPurchaseRange", () => {
  it("never → hasLastPurchase false", () => {
    expect(recencyBucketToLastPurchaseRange("never", AS_OF)).toEqual({
      hasLastPurchase: false,
    });
  });

  it("today → same day range", () => {
    expect(recencyBucketToLastPurchaseRange("today", AS_OF)).toEqual({
      lastPurchaseFrom: AS_OF,
      lastPurchaseTo: AS_OF,
    });
  });
});
