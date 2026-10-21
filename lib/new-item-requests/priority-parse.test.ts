import { describe, expect, it } from "vitest";

import { parseBrandPrioritySheet } from "@/lib/new-item-requests/priority-parse";

describe("parseBrandPrioritySheet", () => {
  it("reads brand name / priority status headers and skips blanks", () => {
    const parsed = parseBrandPrioritySheet([
      ["Brand Name", "Priority Status"],
      ["The Ordinary", "Top Priority Brand"],
      ["", "Standard"],
      ["CeraVe", ""],
      ["CeraVe", "Priority Brand"],
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toEqual([
      {
        brandName: "The Ordinary",
        brandNameNormalized: "the ordinary",
        priority: "Top Priority Brand",
      },
      {
        brandName: "CeraVe",
        brandNameNormalized: "cerave",
        priority: "Priority Brand",
      },
    ]);
  });

  it("accepts vendor + priority headers ignoring case and spaces", () => {
    const parsed = parseBrandPrioritySheet([
      [" VENDOR ", " PRIORITY "],
      ["La Roche-Posay", "Standard"],
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0]?.brandNameNormalized).toBe("la roche-posay");
  });

  it("keeps the last duplicate normalized brand", () => {
    const parsed = parseBrandPrioritySheet([
      ["brand", "priority"],
      ["The Ordinary", "Standard"],
      ["the ordinary", "Top Priority Brand"],
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.priority).toBe("Top Priority Brand");
    expect(parsed.rows[0]?.brandName).toBe("the ordinary");
  });

  it("returns an error when there are no usable rows", () => {
    const parsed = parseBrandPrioritySheet([
      ["Brand", "Priority"],
      ["", "Standard"],
    ]);
    expect(parsed).toEqual({ ok: false, error: "No usable brand priority rows" });
  });

  it("returns an error when headers are missing", () => {
    const parsed = parseBrandPrioritySheet([["Name", "Score"], ["A", "1"]]);
    expect(parsed.ok).toBe(false);
  });
});
