import { describe, expect, it } from "vitest";

import {
  countsAsNewlyEligible,
  countsAsUpdated,
  defaultWeekEndYmd,
  mtdFromYmd,
  weekWindowFromEnd,
} from "@/lib/customer-insight/loyalty-eligible-summary";

describe("loyalty-eligible-summary helpers", () => {
  it("mtdFromYmd uses first of month", () => {
    expect(mtdFromYmd("2026-09-16")).toBe("2026-09-01");
  });

  it("weekWindowFromEnd is 7 inclusive days", () => {
    expect(weekWindowFromEnd("2026-09-14")).toEqual({
      from: "2026-09-08",
      to: "2026-09-14",
    });
  });

  it("defaultWeekEndYmd lands on Sunday for a Wednesday", () => {
    expect(defaultWeekEndYmd("2026-09-16")).toBe("2026-09-13");
  });

  it("countsAsNewlyEligible respects window", () => {
    expect(
      countsAsNewlyEligible({
        loyaltyEligibleAt: new Date("2026-09-10T10:00:00+05:30"),
        fromYmd: "2026-09-01",
        toYmd: "2026-09-16",
      })
    ).toBe(true);
    expect(
      countsAsNewlyEligible({
        loyaltyEligibleAt: new Date("2026-08-31T10:00:00+05:30"),
        fromYmd: "2026-09-01",
        toYmd: "2026-09-16",
      })
    ).toBe(false);
  });

  it("countsAsUpdated for worked status in window", () => {
    expect(
      countsAsUpdated({
        loyaltyOutreachUpdatedAt: new Date("2026-09-05T12:00:00+05:30"),
        loyaltyAssignedAt: null,
        loyaltyOutreachStatus: "contacted",
        fromYmd: "2026-09-01",
        toYmd: "2026-09-16",
      })
    ).toBe(true);
    expect(
      countsAsUpdated({
        loyaltyOutreachUpdatedAt: new Date("2026-09-05T12:00:00+05:30"),
        loyaltyAssignedAt: null,
        loyaltyOutreachStatus: "eligible",
        fromYmd: "2026-09-01",
        toYmd: "2026-09-16",
      })
    ).toBe(false);
    expect(
      countsAsUpdated({
        loyaltyOutreachUpdatedAt: null,
        loyaltyAssignedAt: new Date("2026-09-02T08:00:00+05:30"),
        loyaltyOutreachStatus: "assigned",
        fromYmd: "2026-09-01",
        toYmd: "2026-09-16",
      })
    ).toBe(true);
  });
});
