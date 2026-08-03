import { describe, expect, it } from "vitest";

import { startOfTomorrowAppCalendarUtc } from "@/lib/advance-due-sample-send-later";

describe("startOfTomorrowAppCalendarUtc", () => {
  it("treats Colombo morning of the planned day as due (after previous midnight)", () => {
    // 2026-07-07 00:01 Asia/Colombo = 2026-07-06 18:31 UTC
    const justAfterColomboMidnight = new Date("2026-07-06T18:31:00.000Z");
    const dueBefore = startOfTomorrowAppCalendarUtc(justAfterColomboMidnight);
    expect(dueBefore.toISOString()).toBe("2026-07-08T00:00:00.000Z");

    const plannedFor7th = new Date("2026-07-07T00:00:00.000Z");
    expect(plannedFor7th.getTime()).toBeLessThan(dueBefore.getTime());
  });

  it("does not treat the planned day as due before Colombo midnight", () => {
    // 2026-07-06 23:59 Asia/Colombo = 2026-07-06 18:29 UTC
    const beforeColomboMidnight = new Date("2026-07-06T18:29:00.000Z");
    const dueBefore = startOfTomorrowAppCalendarUtc(beforeColomboMidnight);
    expect(dueBefore.toISOString()).toBe("2026-07-07T00:00:00.000Z");

    const plannedFor7th = new Date("2026-07-07T00:00:00.000Z");
    expect(plannedFor7th.getTime()).toBeGreaterThanOrEqual(dueBefore.getTime());
  });
});
