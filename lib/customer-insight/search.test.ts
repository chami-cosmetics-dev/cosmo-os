import { describe, expect, it } from "vitest";

import {
  buildExactPhoneSearchOrFilters,
  capSearchMatches,
  phoneNumbersMatch,
} from "@/lib/customer-insight/search";
import { CUSTOMER_INSIGHT_SEARCH_CAP } from "@/lib/customer-insight/types";

describe("capSearchMatches", () => {
  it("does not truncate when at or under cap", () => {
    const rows = Array.from({ length: CUSTOMER_INSIGHT_SEARCH_CAP }, (_, i) => i);
    expect(capSearchMatches(rows)).toEqual({
      matches: rows,
      truncated: false,
    });
  });

  it("truncates and flags when over cap", () => {
    const rows = Array.from({ length: CUSTOMER_INSIGHT_SEARCH_CAP + 3 }, (_, i) => i);
    const result = capSearchMatches(rows);
    expect(result.matches).toHaveLength(CUSTOMER_INSIGHT_SEARCH_CAP);
    expect(result.truncated).toBe(true);
    expect(result.matches[0]).toBe(0);
  });
});

describe("phoneNumbersMatch", () => {
  it("matches same number across formats", () => {
    expect(phoneNumbersMatch("0774223062", "0774223062")).toBe(true);
    expect(phoneNumbersMatch("0774223062", "94774223062")).toBe(true);
    expect(phoneNumbersMatch("0774223062", "+94774223062")).toBe(true);
    expect(phoneNumbersMatch("0774223062", "774223062")).toBe(true);
  });

  it("rejects different numbers that only share last digits", () => {
    expect(phoneNumbersMatch("0774223062", "0777403062")).toBe(false);
    expect(phoneNumbersMatch("0774223062", "0711193062")).toBe(false);
    expect(phoneNumbersMatch("0774223062", "0769143062")).toBe(false);
  });
});

describe("buildExactPhoneSearchOrFilters", () => {
  it("uses in-variants only (no endsWith)", () => {
    const filters = buildExactPhoneSearchOrFilters("0774223062");
    expect(filters.length).toBe(2);
    expect(JSON.stringify(filters)).not.toContain("endsWith");
    expect(filters[0]).toHaveProperty("phoneNumber.in");
  });
});
