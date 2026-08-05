import { describe, expect, it } from "vitest";

import { capSearchMatches } from "@/lib/customer-insight/search";
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
