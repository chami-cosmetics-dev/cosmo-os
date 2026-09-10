import { describe, expect, it } from "vitest";

import { postingDateRangeFromQuery } from "@/lib/book-notes/load";

describe("postingDateRangeFromQuery", () => {
  it("matches a full posting date as a single day", () => {
    const range = postingDateRangeFromQuery("2026-09-08");
    expect(range).not.toBeNull();
    expect(range!.gte.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    expect(range!.lte.toISOString()).toBe("2026-09-08T00:00:00.000Z");
  });

  it("expands a year-month to that whole month", () => {
    const range = postingDateRangeFromQuery("2026-02");
    expect(range!.gte.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(range!.lte.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("expands a leap-year February to 29 days", () => {
    const range = postingDateRangeFromQuery("2028-02");
    expect(range!.lte.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("expands a bare year to the whole year", () => {
    const range = postingDateRangeFromQuery("2026");
    expect(range!.gte.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(range!.lte.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  it("ignores whitespace around a date", () => {
    expect(postingDateRangeFromQuery("  2026-09-08 ")).not.toBeNull();
  });

  it("returns null for an invoice number or shop name", () => {
    expect(postingDateRangeFromQuery("SI-2026-0042")).toBeNull();
    expect(postingDateRangeFromQuery("Chami")).toBeNull();
    expect(postingDateRangeFromQuery("")).toBeNull();
  });
});
