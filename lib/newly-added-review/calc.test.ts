import { describe, expect, it } from "vitest";

import {
  buildNewlyAddedReview,
  durationMonths,
  lastIncludedCreatedMonth,
  maxSaleQtyInWindow,
  monthLabel,
  parseReviewRecipients,
  type NewlyAddedReviewInput,
} from "@/lib/newly-added-review/calc";
import { buildNewlyAddedReviewMail } from "@/lib/newly-added-review/mail-html";

const item = (sku: string, createdDate: string | null, priority: string | null = "Newly Added", stock = 5): NewlyAddedReviewInput => ({
  sku,
  productTitle: `Title ${sku}`,
  priority,
  createdDate,
  currentStock: stock,
});

describe("month rule", () => {
  it("November mail includes July or earlier; December includes August or earlier", () => {
    expect(lastIncludedCreatedMonth("2026-11")).toBe("2026-07");
    expect(lastIncludedCreatedMonth("2026-12")).toBe("2026-08");
    expect(lastIncludedCreatedMonth("2027-02")).toBe("2026-10");
    expect(lastIncludedCreatedMonth("2026-04")).toBe("2025-12");
  });

  it("an August item is reported in December, not November", () => {
    const aug = [item("AUG_1", "2026-08-31")];
    expect(buildNewlyAddedReview(aug, "2026-11").needsCheck).toHaveLength(0);
    expect(buildNewlyAddedReview(aug, "2026-12").needsCheck).toHaveLength(1);
  });

  it("duration = calendar months to the mail month; same month = 0", () => {
    expect(durationMonths("2026-07-01", "2026-11")).toBe(4);
    expect(durationMonths("2026-07-31", "2026-11")).toBe(4);
    expect(durationMonths("2025-12-15", "2026-03")).toBe(3);
    expect(durationMonths("2026-11-17", "2026-11")).toBe(0);
  });
});

describe("buildNewlyAddedReview (November 2026 mail)", () => {
  const review = buildNewlyAddedReview(
    [
      item("CE019_2", "2026-07-20"),
      item("CE019_1", "2026-07-20"),
      item("OLD_1", "2026-03-02"),
      item("AUG_1", "2026-08-01"),
      item("NOV_1", "2026-11-03"),
      item("NODATE_1", null),
      item("TOP_1", "2026-01-01", "Top"),
      item("NEW_1", "2026-06-10", "New"), // ERP spelling, still Newly Added
    ],
    "2026-11",
  );

  it("only Newly Added items; variant SKUs kept separate", () => {
    expect(review.all.map((r) => r.sku)).toEqual(["OLD_1", "NEW_1", "CE019_1", "CE019_2", "AUG_1", "NOV_1", "NODATE_1"]);
    expect(review.all.every((r) => r.priorityStatus === "Newly Added")).toBe(true);
  });

  it("Sheet 1 = created July or earlier, oldest first; unknown created date left out", () => {
    expect(review.needsCheck.map((r) => [r.sku, r.durationMonths])).toEqual([
      ["OLD_1", 8],
      ["NEW_1", 5],
      ["CE019_1", 4],
      ["CE019_2", 4],
    ]);
  });

  it("Sheet 2 durations: created this month = 0, no created date = null", () => {
    expect(review.all.find((r) => r.sku === "NOV_1")!.durationMonths).toBe(0);
    expect(review.all.find((r) => r.sku === "NODATE_1")!.durationMonths).toBeNull();
  });

  it("mail table counts Sheet 1 by created month, oldest first", () => {
    expect(review.byCreatedMonth).toEqual([
      { month: "2026-03", count: 1 },
      { month: "2026-06", count: 1 },
      { month: "2026-07", count: 2 },
    ]);
  });

  it("mail: opening with N in bold, table with Total, sheet list, grey note + data source", () => {
    const mail = buildNewlyAddedReviewMail(review);
    expect(mail.subject).toBe("Newly Added Priority Review - November 2026");
    expect(mail.html).toContain(
      "<strong>4</strong> items have been Newly Added for 3 months or more and need a priority decision. Please review each item and move it to Top, Low or Discontinue, depending on its movement.",
    );
    expect(mail.html).toContain("Items needing a decision");
    expect(mail.html).toMatch(/July 2026<\/td><td[^>]*>2<\/td>/);
    expect(mail.html).toMatch(/Total<\/td><td[^>]*>4<\/td>/);
    expect(mail.html).toContain("Sheet 1 &quot;Needs Priority Check&quot;: the 4 items above, oldest first.");
    expect(mail.html).toContain("Sheet 2 &quot;All Newly Added&quot;: all 7 items currently Newly Added (includes the 4).");
    expect(mail.html).toContain(
      "Covers all channels (Online and Shop). Created date = date the item first came into stock. Current stock = live stock across all warehouses.",
    );
    expect(mail.html).toContain("Data source: ERP");
    // Order: opening → table → sheets → note → source.
    const at = (s: string) => mail.html.indexOf(s);
    expect(at("need a priority decision")).toBeLessThan(at("<table"));
    expect(at("<table")).toBeLessThan(at("Sheet 1"));
    expect(at("Sheet 2")).toBeLessThan(at("Covers all channels"));
    expect(at("Covers all channels")).toBeLessThan(at("Data source"));
    expect(mail.plain).toContain("4 items have been Newly Added");
    expect(mail.plain).toContain("Total | 4");
  });

  it("TEST MAIL banner only on test sends", () => {
    const scheduled = buildNewlyAddedReviewMail(review);
    expect(scheduled.html).not.toContain("TEST MAIL");
    expect(scheduled.plain).not.toContain("TEST MAIL");
    const test = buildNewlyAddedReviewMail(review, { test: true });
    expect(test.subject).toBe("[TEST] Newly Added Priority Review - November 2026");
    expect(test.html).toContain("TEST MAIL");
  });

  it("no items needing a decision: says so instead of an empty table", () => {
    const mail = buildNewlyAddedReviewMail(buildNewlyAddedReview([item("NOV_1", "2026-11-03")], "2026-11"));
    expect(mail.html).toContain("No items have been Newly Added for 3 months or more this month");
    expect(mail.html).not.toContain("<table");
  });
});

describe("Max Sale Qty (Sales Budget's Highest Sale Qty over the item's life)", () => {
  const units = new Map([
    ["2026-05", 99], // before the created month: not counted
    ["2026-06", 4],
    ["2026-08", 9],
    ["2026-10", 6],
    ["2026-11", 50], // the mail month: never counted
  ]);

  it("5 months old (created June, November mail): best month of June–October", () => {
    expect(durationMonths("2026-06-15", "2026-11")).toBe(5);
    expect(maxSaleQtyInWindow(units, "2026-06-15", "2026-11")).toBe(9);
  });

  it("4 months old (created July): July–October only", () => {
    expect(maxSaleQtyInWindow(new Map([["2026-06", 30], ["2026-07", 2], ["2026-10", 6]]), "2026-07-01", "2026-11")).toBe(6);
  });

  it("window crosses a year; no sales = 0", () => {
    expect(maxSaleQtyInWindow(new Map([["2025-12", 8], ["2026-01", 3]]), "2025-11-20", "2026-03")).toBe(8);
    expect(maxSaleQtyInWindow(undefined, "2026-06-15", "2026-11")).toBe(0);
    expect(maxSaleQtyInWindow(new Map(), "2026-06-15", "2026-11")).toBe(0);
  });

  it("set on Sheet 1 rows only", () => {
    const review = buildNewlyAddedReview(
      [item("OLD_1", "2026-06-15"), item("NOV_1", "2026-11-03")],
      "2026-11",
      (sku) => (sku === "OLD_1" ? units : new Map([["2026-11", 5]])),
    );
    expect(review.needsCheck.map((r) => [r.sku, r.maxSaleQty])).toEqual([["OLD_1", 9]]);
    expect(review.all.find((r) => r.sku === "NOV_1")!.maxSaleQty).toBeNull();
  });
});

describe("helpers", () => {
  it("monthLabel", () => {
    expect(monthLabel("2026-12")).toBe("December 2026");
  });

  it("recipients: comma separated, trimmed, de-duplicated, invalid dropped", () => {
    expect(parseReviewRecipients(" a@x.lk, B@x.lk ,a@x.lk, nope ,")).toEqual(["a@x.lk", "b@x.lk"]);
    expect(parseReviewRecipients("")).toEqual([]);
    expect(parseReviewRecipients(undefined)).toEqual([]);
  });
});

describe("buildNewlyAddedReviewWorkbook", () => {
  it("two sheets, the six columns, rows in order", { timeout: 30_000 }, async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { buildNewlyAddedReviewWorkbook, NEWLY_ADDED_HEADER_ROW } = await import("@/lib/newly-added-review/workbook");
    const sales = new Map([["A_1", new Map([["2026-03", 7], ["2026-09", 11]])]]);
    const review = buildNewlyAddedReview(
      [item("B_1", "2026-07-01", "Newly Added", 12), item("A_1", "2026-02-01"), item("C_1", null)],
      "2026-11",
      (sku) => sales.get(sku),
    );
    const { fileName, buffer } = await buildNewlyAddedReviewWorkbook(review, "2026-11-18 09:00:00");
    expect(fileName).toBe("newly-added-priority-review-2026-11.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Needs Priority Check", "All Newly Added"]);
    const base = ["SKU", "Product title", "Priority status", "Created date", "Duration (months)", "Current stock"];
    const s1 = wb.getWorksheet("Needs Priority Check")!;
    const s2 = wb.getWorksheet("All Newly Added")!;
    // Max Sale Qty on Sheet 1 only.
    expect((s1.getRow(NEWLY_ADDED_HEADER_ROW).values as unknown[]).slice(1)).toEqual([...base, "Max Sale Qty"]);
    expect((s2.getRow(NEWLY_ADDED_HEADER_ROW).values as unknown[]).slice(1)).toEqual(base);
    expect((s1.getRow(NEWLY_ADDED_HEADER_ROW + 1).values as unknown[]).slice(1)).toEqual([
      "A_1", "Title A_1", "Newly Added", "2026-02-01", 9, 5, 11,
    ]);
    expect(s1.getCell(NEWLY_ADDED_HEADER_ROW + 2, 1).value).toBe("B_1");
    expect(s1.getCell(NEWLY_ADDED_HEADER_ROW + 2, 6).value).toBe(12);
    expect(s1.getCell(NEWLY_ADDED_HEADER_ROW + 2, 7).value).toBe(0); // no sales
    expect(s1.getCell(NEWLY_ADDED_HEADER_ROW + 3, 1).value ?? null).toBeNull();
    expect((s2.getRow(NEWLY_ADDED_HEADER_ROW + 3).values as unknown[]).slice(1, 6)).toEqual(["C_1", "Title C_1", "Newly Added", "-", "-"]);
    expect(s2.getCell(NEWLY_ADDED_HEADER_ROW + 1, 7).value ?? null).toBeNull();
  });
});

describe("send day: first Tuesday of the month, November 2026 on the 24th", () => {
  it("first Tuesdays", async () => {
    const { firstTuesdayOf } = await import("@/lib/newly-added-review/calc");
    expect(firstTuesdayOf("2026-12")).toBe("2026-12-01");
    expect(firstTuesdayOf("2027-01")).toBe("2027-01-05");
    expect(firstTuesdayOf("2027-02")).toBe("2027-02-02");
    expect(firstTuesdayOf("2026-11")).toBe("2026-11-03");
  });

  it("November 2026 only: Tuesday 24th; other months unaffected", async () => {
    const { newlyAddedReviewSendDate } = await import("@/lib/newly-added-review/calc");
    expect(newlyAddedReviewSendDate("2026-11")).toBe("2026-11-24");
    expect(new Date("2026-11-24T00:00:00Z").getUTCDay()).toBe(2);
    expect(newlyAddedReviewSendDate("2026-12")).toBe("2026-12-01");
    expect(newlyAddedReviewSendDate("2027-11")).toBe("2027-11-02");
  });
});
