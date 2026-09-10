import { describe, expect, it } from "vitest";

import {
  addCalendarMonthsUtc,
  callQueueHideReason,
  eligibleAtStartOfUtcDayAfter,
  isHiddenFromCallQueueAssign,
} from "@/lib/customer-insight/call-queue-hide";

describe("call-queue hide windows", () => {
  it("adds two calendar months including 24 Aug → 24 Oct", () => {
    const from = new Date("2026-08-24T12:00:00.000Z");
    expect(addCalendarMonthsUtc(from, 2).toISOString()).toBe(
      "2026-10-24T12:00:00.000Z"
    );
  });

  it("clamps 31 Jan + 2 months to last day of March", () => {
    const from = new Date("2026-01-31T00:00:00.000Z");
    expect(addCalendarMonthsUtc(from, 2).toISOString().slice(0, 10)).toBe(
      "2026-03-31"
    );
  });

  it("Not Responding eligible at start of day +7", () => {
    const from = new Date("2026-08-24T15:30:00.000Z");
    expect(eligibleAtStartOfUtcDayAfter(from, 7).toISOString()).toBe(
      "2026-08-31T00:00:00.000Z"
    );
  });

  it("hides Black List and Wrong Number forever", () => {
    const now = new Date("2026-12-01T00:00:00.000Z");
    expect(
      isHiddenFromCallQueueAssign({
        now,
        currentCategory: "Black List",
        allocationAt: null,
        lastNonAllocationAt: null,
        lastNonAllocationCategory: null,
        hasPendingQueue: false,
      })
    ).toBe(true);
    expect(
      isHiddenFromCallQueueAssign({
        now,
        currentCategory: "Wrong Number",
        allocationAt: null,
        lastNonAllocationAt: null,
        lastNonAllocationCategory: null,
        hasPendingQueue: false,
      })
    ).toBe(true);
  });

  it("hides pending queue", () => {
    expect(
      isHiddenFromCallQueueAssign({
        now: new Date("2026-08-24T00:00:00.000Z"),
        currentCategory: null,
        allocationAt: null,
        lastNonAllocationAt: null,
        lastNonAllocationCategory: null,
        hasPendingQueue: true,
      })
    ).toBe(true);
  });

  it("hides recent allocation for 2 months", () => {
    const allocated = new Date("2026-08-24T00:00:00.000Z");
    expect(
      isHiddenFromCallQueueAssign({
        now: new Date("2026-10-23T00:00:00.000Z"),
        currentCategory: null,
        allocationAt: allocated,
        lastNonAllocationAt: null,
        lastNonAllocationCategory: null,
        hasPendingQueue: false,
      })
    ).toBe(true);
    expect(
      isHiddenFromCallQueueAssign({
        now: new Date("2026-10-24T00:00:00.000Z"),
        currentCategory: null,
        allocationAt: allocated,
        lastNonAllocationAt: null,
        lastNonAllocationCategory: null,
        hasPendingQueue: false,
      })
    ).toBe(false);
  });

  it("Not Interested uses 2-month hide, Not Responding uses 1 week", () => {
    const at = new Date("2026-08-24T12:00:00.000Z");
    expect(
      isHiddenFromCallQueueAssign({
        now: new Date("2026-08-30T00:00:00.000Z"),
        currentCategory: "Not Interested",
        allocationAt: null,
        lastNonAllocationAt: at,
        lastNonAllocationCategory: "Not Interested",
        hasPendingQueue: false,
      })
    ).toBe(true);
    expect(
      isHiddenFromCallQueueAssign({
        now: new Date("2026-08-30T00:00:00.000Z"),
        currentCategory: "Not Responding",
        allocationAt: null,
        lastNonAllocationAt: at,
        lastNonAllocationCategory: "Not Responding",
        hasPendingQueue: false,
      })
    ).toBe(true);
    expect(
      isHiddenFromCallQueueAssign({
        now: new Date("2026-08-31T00:00:00.000Z"),
        currentCategory: "Not Responding",
        allocationAt: null,
        lastNonAllocationAt: at,
        lastNonAllocationCategory: "Not Responding",
        hasPendingQueue: false,
      })
    ).toBe(false);
  });
});

describe("callQueueHideReason", () => {
  const now = new Date("2026-12-01T00:00:00.000Z");

  it("labels permanent omit, queued, and allocation cooling", () => {
    expect(
      callQueueHideReason({
        now,
        currentCategory: "Black List",
        allocationAt: null,
        lastNonAllocationAt: null,
        lastNonAllocationCategory: null,
        hasPendingQueue: false,
      })
    ).toBe("Black List");
    expect(
      callQueueHideReason({
        now,
        currentCategory: null,
        allocationAt: null,
        lastNonAllocationAt: null,
        lastNonAllocationCategory: null,
        hasPendingQueue: true,
      })
    ).toBe("Already queued");
    expect(
      callQueueHideReason({
        now: new Date("2026-10-23T00:00:00.000Z"),
        currentCategory: null,
        allocationAt: new Date("2026-08-24T00:00:00.000Z"),
        lastNonAllocationAt: null,
        lastNonAllocationCategory: null,
        hasPendingQueue: false,
      })
    ).toBe("Allocated < 2 months");
  });

  it("labels outreach cooling and returns null when eligible", () => {
    const at = new Date("2026-08-24T12:00:00.000Z");
    expect(
      callQueueHideReason({
        now: new Date("2026-08-30T00:00:00.000Z"),
        currentCategory: "Not Interested",
        allocationAt: null,
        lastNonAllocationAt: at,
        lastNonAllocationCategory: "Not Interested",
        hasPendingQueue: false,
      })
    ).toBe("Not Interested (< 2 months)");
    expect(
      callQueueHideReason({
        now: new Date("2026-08-30T00:00:00.000Z"),
        currentCategory: "Not Responding",
        allocationAt: null,
        lastNonAllocationAt: at,
        lastNonAllocationCategory: "Not Responding",
        hasPendingQueue: false,
      })
    ).toBe("Not Responding (7 days)");
    expect(
      callQueueHideReason({
        now: new Date("2026-08-31T00:00:00.000Z"),
        currentCategory: "Not Responding",
        allocationAt: null,
        lastNonAllocationAt: at,
        lastNonAllocationCategory: "Not Responding",
        hasPendingQueue: false,
      })
    ).toBeNull();
  });
});
