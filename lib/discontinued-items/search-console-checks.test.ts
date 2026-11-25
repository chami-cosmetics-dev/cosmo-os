import { describe, expect, it } from "vitest";

import {
  checkReportContents,
  checkReportCreatedToday,
  fileCreatedDate,
} from "@/lib/discontinued-items/search-console-checks";

/** 20 Nov 2026, 14:00 in Sri Lanka (08:30 UTC). */
const NOW = new Date("2026-11-20T08:30:00Z");

/** Chart rows from `first` for `count` days (as text, like the real export). */
function chart(first: string, count: number): unknown[][] {
  const start = Date.parse(`${first}T00:00:00Z`);
  const rows: unknown[][] = [["Date", "Clicks", "Impressions", "CTR", "Position"]];
  for (let i = 0; i < count; i++) {
    rows.push([new Date(start + i * 86_400_000).toISOString().slice(0, 10), 400, 7000, 0.057, 4.3]);
  }
  return rows;
}

const FILTERS = [
  ["Filter", "Value"],
  ["Search type", "Web (text-based)"],
  ["Date", "Last 3 months"],
  ["Country", "Sri Lanka"],
  ["Page", "+https://cosmetics.lk/products"],
];
const PAGES = [["Top pages", "Clicks", "Impressions", "CTR", "Position"]];
/** The sample export: 18 Aug – 17 Nov (92 days), 3 days before 20 Nov. */
const GOOD = { Chart: chart("2026-08-18", 92), Pages: PAGES, Filters: FILTERS };

describe("checkReportCreatedToday", () => {
  it("passes for a file created today in Sri Lanka time", () => {
    // 05:26 UTC = 10:56 in Sri Lanka, the sample file's created time.
    expect(checkReportCreatedToday(new Date("2026-11-20T05:26:00Z"), NOW)).toEqual({ ok: true });
  });

  it("uses Sri Lanka time, not UTC", () => {
    // 19 Nov 19:00 UTC is already 20 Nov 00:30 in Sri Lanka → today.
    expect(checkReportCreatedToday(new Date("2026-11-19T19:00:00Z"), NOW).ok).toBe(true);
    // 19 Nov 18:00 UTC is 19 Nov 23:30 in Sri Lanka → yesterday.
    const late = checkReportCreatedToday(new Date("2026-11-19T18:00:00Z"), NOW);
    expect(late.ok).toBe(false);
  });

  it("rejects another day, showing the date found and today", () => {
    const result = checkReportCreatedToday(new Date("2026-11-18T05:00:00Z"), NOW);
    expect(result).toEqual({
      ok: false,
      error:
        "This report was created on 18 Nov 2026, not today (20 Nov 2026). Export a new report from " +
        "Search Console today and upload that file.",
    });
  });

  it("rejects a file with no created date", () => {
    const result = checkReportCreatedToday(fileCreatedDate(undefined), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no created date");
  });

  it("reads the property as a Date or ISO text; junk = none", () => {
    expect(fileCreatedDate("2026-11-20T05:26:00.000Z")?.toISOString()).toBe("2026-11-20T05:26:00.000Z");
    expect(fileCreatedDate(new Date("2026-11-20T05:26:00Z"))?.getTime()).toBe(Date.parse("2026-11-20T05:26:00Z"));
    expect(fileCreatedDate("not a date")).toBeNull();
    expect(fileCreatedDate("")).toBeNull();
  });
});

describe("checkReportContents", () => {
  it("passes the sample export's shape", () => {
    expect(checkReportContents(GOOD, NOW)).toEqual({ ok: true });
  });

  it("rejects a missing Filters sheet", () => {
    const result = checkReportContents({ Chart: GOOD.Chart, Pages: PAGES }, NOW);
    expect(!result.ok && result.error).toBe(
      "Report check failed: the file has no Filters sheet. Upload the Search Console Performance export as Excel.",
    );
  });

  it("names every wrong or missing filter", () => {
    const result = checkReportContents(
      {
        ...GOOD,
        Filters: [["Filter", "Value"], ["Search type", "Image"], ["Date", "Last 28 days"], ["Page", "+/products"]],
      },
      NOW,
    );
    expect(!result.ok && result.error).toBe(
      'Report check failed: filter "Date" is "Last 28 days" (expected Last 3 months); ' +
        'filter "Search type" is "Image" (expected Web); filter "Country" is not set (expected Sri Lanka).',
    );
  });

  it("rejects a Pages sheet without Top pages, or no Pages sheet", () => {
    const noColumn = checkReportContents({ ...GOOD, Pages: [["Page", "Clicks"]] }, NOW);
    expect(!noColumn.ok && noColumn.error).toBe('Report check failed: the Pages sheet has no "Top pages" column.');
    const noSheet = checkReportContents({ Chart: GOOD.Chart, Filters: FILTERS }, NOW);
    expect(!noSheet.ok && noSheet.error).toBe("Report check failed: the file has no Pages sheet.");
  });

  it("rejects a missing or dateless Chart sheet", () => {
    const result = checkReportContents({ Pages: PAGES, Filters: FILTERS }, NOW);
    expect(!result.ok && result.error).toBe("Report check failed: the file has no Chart sheet with dates.");
  });

  it("rejects a Chart that is not about 90 days", () => {
    const result = checkReportContents({ ...GOOD, Chart: chart("2026-10-21", 28) }, NOW);
    expect(!result.ok && result.error).toBe(
      "Report check failed: the Chart covers 28 days (21 Oct 2026 to 17 Nov 2026); expected about 90 (Last 3 months).",
    );
  });

  it("accepts a Chart ending 1 to 4 days before today, rejects outside that", () => {
    // Ends 19 Nov (1 day) and 16 Nov (4 days): fine.
    expect(checkReportContents({ ...GOOD, Chart: chart("2026-08-20", 92) }, NOW).ok).toBe(true);
    expect(checkReportContents({ ...GOOD, Chart: chart("2026-08-17", 92) }, NOW).ok).toBe(true);
    // Ends 5 Nov: 15 days before.
    const old = checkReportContents({ ...GOOD, Chart: chart("2026-08-06", 92) }, NOW);
    expect(!old.ok && old.error).toBe(
      "Report check failed: the Chart ends on 5 Nov 2026, 15 days before today; expected 1 to 4 days before today.",
    );
    // Ends today.
    const today = checkReportContents({ ...GOOD, Chart: chart("2026-08-21", 92) }, NOW);
    expect(!today.ok && today.error).toContain("20 Nov 2026, today;");
  });

  it("reads Chart dates saved as Excel day numbers", () => {
    // 46252 = 2026-08-18 (Excel day number).
    const rows: unknown[][] = [["Date", "Clicks"]];
    for (let i = 0; i < 92; i++) rows.push([46252 + i, 1]);
    expect(checkReportContents({ ...GOOD, Chart: rows }, NOW)).toEqual({ ok: true });
  });
});
