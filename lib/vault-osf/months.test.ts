import { describe, expect, it } from "vitest";

import {
  monthKeysInWindow,
  monthPostingBounds,
  monthSectionLabel,
  reportingAprilStart,
} from "@/lib/vault-osf/months";

describe("vault OSF month window", () => {
  it("covers April through as-of month", () => {
    expect(reportingAprilStart("2026-09-07")).toBe("2026-04-01");
    expect(monthKeysInWindow("2026-09-07")).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("wraps Jan–Mar to previous April", () => {
    expect(reportingAprilStart("2027-03-15")).toBe("2026-04-01");
    expect(monthKeysInWindow("2027-01-15")[0]).toBe("2026-04");
    expect(monthKeysInWindow("2027-01-15").at(-1)).toBe("2027-01");
  });

  it("truncates current month to as-of date", () => {
    expect(monthPostingBounds("2026-09", "2026-09-07")).toEqual({
      start: "2026-09-01",
      end: "2026-09-07",
    });
    expect(monthPostingBounds("2026-06", "2026-09-07")).toEqual({
      start: "2026-06-01",
      end: "2026-06-30",
    });
  });

  it("keeps 1st-of-month as its own truncated group", () => {
    expect(monthPostingBounds("2026-09", "2026-09-01")).toEqual({
      start: "2026-09-01",
      end: "2026-09-01",
    });
    expect(monthSectionLabel("2026-09", "2026-09-07")).toBe("SEPTEMBER 07.09.2026");
    expect(monthSectionLabel("2026-04", "2026-09-07")).toBe("APRIL");
  });
});
