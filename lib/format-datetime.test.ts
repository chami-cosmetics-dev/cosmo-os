import { describe, expect, it } from "vitest";

import {
  APP_TIME_ZONE,
  formatAppDateTime,
  formatAppIsoCalendarDate,
  formatAppIsoDate,
  formatAppIsoDateTime,
  formatAppIsoTime,
  formatAppStoredDateTime,
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
    expect(formatAppIsoDateTime(iso)).toBe("2026-07-14 04:00:00");
    expect(formatAppIsoTime(iso)).toBe("04:00:00.000");
  });

  it("keeps date-only calendar fields on the UTC calendar day", () => {
    expect(formatAppIsoCalendarDate("2026-07-20T00:00:00.000Z")).toBe("2026-07-20");
  });

  it("shows legacy UTC-midnight return dates as Colombo local midnight, not 5:30 AM", () => {
    const formatted = formatAppStoredDateTime("2026-07-20T00:00:00.000Z");
    expect(formatted).toContain("2026");
    expect(formatted).not.toMatch(/5:30/);
  });
});
