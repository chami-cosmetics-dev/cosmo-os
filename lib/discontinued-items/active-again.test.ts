import { describe, expect, it } from "vitest";

import {
  activeAgainPlaceholders,
  describeSchedule,
  isWeeklyRunDue,
  parseActiveAgainSchedule,
  weeklySlot,
} from "@/lib/discontinued-items/active-again";

const MONDAY_930 = { weekday: 1, time: "09:30" };

describe("parseActiveAgainSchedule", () => {
  it("falls back to Monday 9:30 for missing or bad values", () => {
    expect(parseActiveAgainSchedule(null)).toEqual(MONDAY_930);
    expect(parseActiveAgainSchedule({ weekday: 9, time: "25:00" })).toEqual(MONDAY_930);
    expect(parseActiveAgainSchedule({ weekday: 3, time: "14:05" })).toEqual({ weekday: 3, time: "14:05" });
  });
  it("describes the schedule", () => {
    expect(describeSchedule(MONDAY_930)).toBe("Monday 9:30 AM");
    expect(describeSchedule({ weekday: 0, time: "00:15" })).toBe("Sunday 12:15 AM");
    expect(describeSchedule({ weekday: 5, time: "13:00" })).toBe("Friday 1:00 PM");
  });
});

describe("weeklySlot / isWeeklyRunDue (Asia/Colombo)", () => {
  // Monday 2026-11-23 09:30 Colombo = 04:00 UTC.
  it("Monday 9:30 slot of the week", () => {
    const { weekKey, slot } = weeklySlot(new Date("2026-11-25T08:00:00Z"), MONDAY_930);
    expect(weekKey).toBe("2026-11-23");
    expect(slot.toISOString()).toBe("2026-11-23T04:00:00.000Z");
  });
  it("is due from the slot on, once per week", () => {
    expect(isWeeklyRunDue(new Date("2026-11-23T03:59:00Z"), MONDAY_930, null)).toBe(false);
    expect(isWeeklyRunDue(new Date("2026-11-23T04:00:00Z"), MONDAY_930, null)).toBe(true);
    expect(isWeeklyRunDue(new Date("2026-11-26T10:00:00Z"), MONDAY_930, "2026-11-23")).toBe(false);
    expect(isWeeklyRunDue(new Date("2026-11-30T04:10:00Z"), MONDAY_930, "2026-11-23")).toBe(true);
  });
  it("a Sunday late-night Colombo time still belongs to that week", () => {
    // Sunday 2026-11-29 23:30 Colombo = 18:00 UTC; week of Monday 2026-11-23.
    expect(weeklySlot(new Date("2026-11-29T18:00:00Z"), MONDAY_930).weekKey).toBe("2026-11-23");
  });
});

describe("activeAgainPlaceholders", () => {
  it("builds the table with escaped values", () => {
    const p = activeAgainPlaceholders([
      {
        sku: "ABC_1",
        itemName: "Cream <50ml>",
        maxSale: 4,
        impressions: 3698,
        clicks: 55,
        ctr: 0.0149,
        avgPosition: 5.39,
        reason: "Supplier stopped",
        draftedDate: "2026-11-21",
        currentPriority: "Top",
      },
    ]);
    expect(p.itemCount).toBe("1");
    expect(p.tableHtml).toContain("Cream &lt;50ml&gt;");
    expect(p.tableHtml).toContain("1.49%");
    expect(p.tableHtml).toContain("3,698");
    expect(p.tableHtml).toContain("Priority after being made active");
  });
});
