import { describe, expect, it } from "vitest";

import type { StockHealthRopCounts, StockHealthStatusTotals } from "@/lib/stock-health/config";
import {
  buildStockHealthSummaryMail,
  formatMailChange,
  formatMailPercent,
  type StockHealthSummaryMailData,
} from "@/lib/stock-health/summary-mail-html";
import { buildDiscontinueMovement } from "@/lib/stock-health/discontinue-movement";

function counts(c: Omit<StockHealthRopCounts, "total">): StockHealthRopCounts {
  return { ...c, total: c.pass + c.fail + c.noRopWithStock + c.noRopNoStock };
}

const current: StockHealthStatusTotals[] = [
  { status: "Top", count: 291, stock: 5000 },
  { status: "Low", count: 10, stock: 40 },
  { status: "Newly Added", count: 5, stock: 12 },
  { status: "Discontinue", count: 3, stock: 0 },
  { status: "Blank", count: 0, stock: 0 },
];

const top = counts({ pass: 202, fail: 50, noRopWithStock: 30, noRopNoStock: 9, zeroStock: 20 });
const low = counts({ pass: 4, fail: 3, noRopWithStock: 2, noRopNoStock: 1, zeroStock: 1 });

function data(over: Partial<StockHealthSummaryMailData> = {}): StockHealthSummaryMailData {
  return {
    dateLabel: "16/11/2026",
    month: "November",
    stockAsOf: "16/11/2026, 9:30:05 am",
    sentAt: "16/11/2026, 9:31:00 am",
    current,
    previous: null,
    rop: {
      rows: [
        { status: "Top", ...top },
        { status: "Low", ...low },
      ],
      grandTotal: counts({ pass: 206, fail: 53, noRopWithStock: 32, noRopNoStock: 10, zeroStock: 21 }),
    },
    ...over,
  };
}

describe("formatMailPercent", () => {
  it("is count / row Grand Total to 1 decimal place", () => {
    expect(formatMailPercent(202, 291)).toBe("69.4%");
    expect(formatMailPercent(5, 10)).toBe("50.0%");
    expect(formatMailPercent(0, 0)).toBe("-");
  });
});

describe("formatMailChange", () => {
  it("signs the change like the screen", () => {
    expect(formatMailChange(12)).toBe("+ 12");
    expect(formatMailChange(-3)).toBe("- 3");
    expect(formatMailChange(0)).toBe("0");
  });
});

describe("buildStockHealthSummaryMail", () => {
  it("names each of the two mails in the subject, with [TEST] for a test mail", () => {
    expect(buildStockHealthSummaryMail(data(), "weekly").subject).toBe(
      "Stock Health Summary - Weekly Summary - 16/11/2026",
    );
    expect(buildStockHealthSummaryMail(data(), "rop").subject).toBe(
      "Stock Health Summary - Stock Availability Status - Overall - 16/11/2026",
    );
    expect(buildStockHealthSummaryMail(data({ test: true }), "rop").subject).toBe(
      "[TEST] Stock Health Summary - Stock Availability Status - Overall - 16/11/2026",
    );
  });

  it("mail 1 has only the Weekly Summary; first send: Count | Current Stock, no Blank when empty", () => {
    const { html, plain } = buildStockHealthSummaryMail(data(), "weekly");
    expect(html).toContain(">Weekly Summary<");
    expect(html).not.toContain(">Stock Availability Status - Overall<");
    expect(html).not.toContain("PASS %");
    expect(html).not.toContain("Previous week (");
    expect(html).not.toContain(">Blank<");
    expect(html).not.toMatch(/class=/);
    expect(plain).not.toContain("STOCK AVAILABILITY STATUS");
  });

  it("both mails end with a Data sources table; ROP source only in mail 2", () => {
    const weekly = buildStockHealthSummaryMail(data(), "weekly");
    const rop = buildStockHealthSummaryMail(data(), "rop");
    for (const mail of [weekly, rop]) {
      expect(mail.html).toContain(">Data sources<");
      expect(mail.html).toContain("Stock Balance Summary - Item Wise");
      expect(mail.html.indexOf(">Data sources<")).toBeGreaterThan(mail.html.indexOf("<table"));
      expect(mail.plain).toContain("DATA SOURCES");
    }
    expect(rop.html).toContain("Order Supporting File (OSF) ROP");
    expect(weekly.html).not.toContain("Order Supporting File");
    expect(weekly.html).toContain("snapshot saved when last week");
  });

  it("mail 2 has only Stock Availability Status - Overall", () => {
    const { html, plain } = buildStockHealthSummaryMail(data(), "rop");
    expect(html).toContain(">Stock Availability Status - Overall<");
    expect(html).not.toContain(">Weekly Summary<");
    expect(html).toContain("69.4%");
    expect(html).toContain("November - 16/11/2026");
    expect(html).toContain("0' Stock overlaps the groups and is not in the Grand Total.");
    expect(html).not.toMatch(/class=/);
    expect(plain).toContain("STOCK AVAILABILITY STATUS - OVERALL (November)");
    expect(plain).not.toContain("WEEKLY SUMMARY");
  });

  it("mail 2 ends with the Company Wise table, each group split by priority", () => {
    const counts = { pass: 6, fail: 3, noRopWithStock: 1, noRopNoStock: 2, total: 12, zeroStock: 2 };
    const byPriority = {
      Top: counts,
      Discontinue: { pass: 0, fail: 1, noRopWithStock: 1, noRopNoStock: 0, total: 2, zeroStock: 1 },
    };
    const { html, plain } = buildStockHealthSummaryMail(
      data({
        locations: [
          { type: "Shop", label: "OGF", byPriority },
          { type: "Shop", label: "Galle", byPriority },
          { type: "Online", label: "Cosmetics.lk", byPriority },
        ],
      }),
      "rop",
    );
    expect(html).toMatch(/<th colspan="4" style="[^"]*">Pass<\/th>/);
    // Company Total = Top 12 + Discontinue 2 (Low / New have none) = 14, main table only.
    expect(plain).toContain("Shop · OGF · Company Total: 14");
    expect(html).toMatch(/<th rowspan="2" style="[^"]*">Company Total<\/th>/);
    expect(html.match(/>Company Total</g)).toHaveLength(1);
    expect(html).toContain(">New<");
    expect(html).toContain(">Disc.<");
    expect(html).toContain("New = Newly Added · Disc. = Discontinue.");
    expect(html).not.toContain(">Blank<");
    expect(html.indexOf(">Stock Availability Status - Company Wise<")).toBeGreaterThan(html.indexOf("0' Stock overlaps the groups"));
    expect(html).toContain('rowspan="2"');
    expect(html).toContain(">Cosmetics.lk<");
    expect(html).toContain("50.0%");
    expect(buildStockHealthSummaryMail(data(), "weekly").html).not.toContain("Stock Availability Status - Company Wise");
    expect(plain).toContain("Shop · OGF · Top: Pass 6 (50.0%), Fail 3 (25.0%), No ROP - With Stock 1 (8.3%), No ROP - No Stock 2, Grand Total 12");
    expect(plain).toContain("Shop · OGF · Discontinue: Pass 0 (0.0%), Fail 1 (50.0%), No ROP - With Stock 1 (50.0%), Grand Total 2");
    expect(plain).toContain("Shop · OGF · Low: Pass 0 (-)");
    expect(plain).toContain("Shop · OGF · Top: Grand Total 12, 0' Stock 2 (16.7%)");
    // Main table has no 0' Stock; the Out of Stock table follows it.
    const main = html.indexOf(">Stock Availability Status - Company Wise<");
    const oos = html.indexOf(">Stock Availability Status - Company Wise - Out of Stock<");
    expect(oos).toBeGreaterThan(main);
    expect(html.slice(main, oos)).not.toContain("0' Stock");
    expect(html).toMatch(/<th colspan="1" style="[^"]*">No ROP - No Stock<\/th>/);
  });

  it("mail 1 shows Discontinue tracking with system errors listed first; mail 2 does not", () => {
    const movement = buildDiscontinueMovement(
      [
        { commonSku: "D1", status: "Discontinue", itemName: "Old cream" },
        { commonSku: "D2", status: "Discontinue", itemName: "Old gel" },
        { commonSku: "B1", status: "Blank", itemName: "Blank one" },
      ],
      [
        { commonSku: "D1", status: "Top", itemName: "Old cream" },
        { commonSku: "D2", status: "Discontinue", itemName: "Old gel" },
        { commonSku: "B1", status: "Discontinue", itemName: "Blank one" },
        { commonSku: "N1", status: "Discontinue", itemName: "Brand new" },
      ],
    );
    const withTracking = data({ discontinue: { previousDateLabel: "09/11/2026", movement } });
    const { html, plain } = buildStockHealthSummaryMail(withTracking, "weekly");
    expect(html).toContain(">Discontinue Tracking<");
    expect(html).toContain(">Remark<");
    expect(html).toContain(">Discontinue to Top<");
    expect(html).toContain(">B1, N1<");
    expect(html).not.toContain("Old cream");
    expect(html).toContain("Discontinue: 2 on 09/11/2026 → 3 on 16/11/2026.");
    expect(html.indexOf(">Discontinue to Top<")).toBeLessThan(html.indexOf(">System Error<"));
    expect(plain).toContain("System Error (addition): 2 — B1, N1");
    expect(html).toContain(">Status<");
    expect(plain).toContain("Discontinue to Top (reduction): 1 — D1");
    expect(buildStockHealthSummaryMail(withTracking, "rop").html).not.toContain("Discontinue Tracking");
    expect(buildStockHealthSummaryMail(data({ discontinue: null }), "weekly").html).toContain(
      "Starts with next week's mail",
    );
  });

    it("later sends: Previous week | This week | Change", () => {
    const previous = current.map((r) => ({ ...r, count: r.count - 2, stock: r.stock + 10 }));
    const { html, plain } = buildStockHealthSummaryMail(
      data({ previous: { dateLabel: "09/11/2026", rows: previous } }),
      "weekly",
    );
    expect(html).toContain("Previous week (09/11/2026)");
    expect(html).toContain("This week (16/11/2026)");
    expect(html).toContain("+ 2");
    expect(html).toContain("- 10");
    expect(plain).toContain("Top: previous 289 / 5,010, this week 291 / 5,000, change + 2 / - 10");
  });

  it("shows Blank when it has Common SKUs", () => {
    const withBlank = current.map((r) => (r.status === "Blank" ? { ...r, count: 2, stock: 5 } : r));
    expect(buildStockHealthSummaryMail(data({ current: withBlank }), "weekly").html).toContain(">Blank<");
  });
});
