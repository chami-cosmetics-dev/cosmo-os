import { describe, expect, it } from "vitest";

import {
  handleFromUrl,
  mergedMetricsOf,
  parseSearchConsoleSheets,
} from "@/lib/discontinued-items/search-console";

describe("handleFromUrl", () => {
  it("cleans product URLs to the handle", () => {
    expect(handleFromUrl("https://cosmetics.lk/products/acnes-aloe-vera-95-gel")).toBe("acnes-aloe-vera-95-gel");
    expect(handleFromUrl("https://cosmetics.lk/products/acnes-creamy-wash-100g?_pos=9&_sid=ef5b364a7&_ss=r")).toBe(
      "acnes-creamy-wash-100g",
    );
    expect(handleFromUrl("https://cosmetics.lk/products/acnes-creamy-wash-100g?variant=43697826988097")).toBe(
      "acnes-creamy-wash-100g",
    );
    expect(
      handleFromUrl(
        "https://cosmetics.lk/products/cerave-brightening-vitamin-c-cleanser-237ml-usa-1?_pos=71&_sid=182b57128&_ss=r?variant%3D44417598062657",
      ),
    ).toBe("cerave-brightening-vitamin-c-cleanser-237ml-usa-1");
    expect(handleFromUrl("https://cosmetics.lk/products/Some-Item/#reviews")).toBe("some-item");
    expect(handleFromUrl("https://www.cosmetics.lk/products/caf%C3%A9-cream")).toBe("café-cream");
  });

  it("ignores pages that are not product pages", () => {
    expect(handleFromUrl("acnes-creamy-wash-100g")).toBeNull();
    expect(handleFromUrl("https://cosmetics.lk/collections/acnes")).toBeNull();
    expect(handleFromUrl("https://cosmetics.lk/products/")).toBeNull();
    expect(handleFromUrl(null)).toBeNull();
  });
});

const HEADER = ["Top pages", "Clicks", "Impressions", "CTR", "Position"];

describe("parseSearchConsoleSheets", () => {
  // The sample sheet's hand-made row shows position 4.57, but its formula range (C2:C6) also takes
  // in two other products' rows; the three acnes-creamy-wash-100g URLs alone give 5.39.
  it("merges URLs of one handle (acnes-creamy-wash-100g: 55 / 3698 / 1.49% / 5.39)", () => {
    const result = parseSearchConsoleSheets({
      Pages: [
        HEADER,
        ["https://cosmetics.lk/products/acnes-creamy-wash-100g", 52, 3248, 0.016, 5.72],
        ["https://cosmetics.lk/products/acnes-creamy-wash-100g?_pos=9&_sid=ef5b364a7&_ss=r", 2, 404, 0.005, 2.71],
        ["https://cosmetics.lk/products/acnes-creamy-wash-100g?variant=43697826988097", 1, 46, 0.0217, 5.67],
        // A hand-made total row (no URL) must not be counted again.
        ["acnes-creamy-wash-100g", 55, 3698, 0.0149, 4.57],
      ],
      Filters: [
        ["Filter", "Value"],
        ["Search type", "Web (text-based)"],
        ["Date", "Last 3 months"],
        ["Country", "Sri Lanka"],
        ["Page", "+https://cosmetics.lk/products"],
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.productRows).toBe(3);
    expect(result.report.skippedRows).toBe(1);
    expect(result.report.warnings).toEqual([]);
    const merged = mergedMetricsOf(result.report.metrics["acnes-creamy-wash-100g"]);
    expect(merged.clicks).toBe(55);
    expect(merged.impressions).toBe(3698);
    expect(merged.ctr * 100).toBeCloseTo(1.49, 2);
    // (3248×5.72 + 404×2.71 + 46×5.67) ÷ 3698
    expect(merged.avgPosition).toBeCloseTo(5.39, 2);
  });

  it("no matching URL → zeros", () => {
    expect(mergedMetricsOf(undefined)).toEqual({ clicks: 0, impressions: 0, ctr: 0, avgPosition: 0 });
  });

  it("rejects a file without a Top pages column, naming the sheets", () => {
    const result = parseSearchConsoleSheets({ Queries: [["Top queries", "Clicks"]] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Queries");
  });

  it("rejects missing columns, naming them", () => {
    const result = parseSearchConsoleSheets({ Pages: [["Top pages", "Clicks"]] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Impressions, Position");
  });

  it("records the Filters sheet without judging it (checkReportContents does that first)", () => {
    const pages = [HEADER, ["https://cosmetics.lk/products/x", 1, 10, 0.1, 3]];
    const result = parseSearchConsoleSheets({
      Pages: pages,
      Filters: [["Filter", "Value"], ["Date", "Last 28 days"]],
    });
    expect(result.ok && result.report.filters).toEqual({ Date: "Last 28 days" });
    expect(result.ok && result.report.warnings).toEqual([]);
  });
});
