import { describe, expect, it } from "vitest";

import {
  APP_TIME_ZONE,
  formatAppDateTime,
  formatAppIsoDate,
} from "@/lib/format-datetime";

describe("format-datetime", () => {
  it("uses Asia/Colombo as the app timezone", () => {
    expect(APP_TIME_ZONE).toBe("Asia/Colombo");
  });

  it("formats instants in Colombo, not UTC calendar day", () => {
    // 2026-07-13 22:30 UTC = 2026-07-14 04:00 Asia/Colombo
    const iso = "2026-07-13T22:30:00.000Z";
    expect(formatAppIsoDate(iso)).toBe("2026-07-14");
    expect(formatAppDateTime(iso)).toContain("2026");
  });
});
