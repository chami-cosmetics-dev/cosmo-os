import { describe, expect, it } from "vitest";

import { earlierDate } from "@/lib/customer-insight/first-purchase";

describe("earlierDate", () => {
  const older = new Date("2024-01-01T00:00:00.000Z");
  const newer = new Date("2026-06-01T00:00:00.000Z");

  it("keeps the earlier instant", () => {
    expect(earlierDate(newer, older)).toEqual(older);
    expect(earlierDate(older, newer)).toEqual(older);
  });

  it("uses the date that exists", () => {
    expect(earlierDate(null, newer)).toEqual(newer);
    expect(earlierDate(older, undefined)).toEqual(older);
    expect(earlierDate(null, null)).toBeNull();
  });
});
