import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  STOCK_PRICE_MISSING_DAILY_KEY,
  builtinTemplateByKey,
} from "@/lib/email-templates/catalog";
import {
  buildStockPriceMissingEmailContent,
  formatLocationsCell,
} from "@/lib/stock-price-missing/build-content";
import { classifyPriceGap } from "@/lib/stock-price-missing/gap";
import {
  buildStockPriceMissingWorkbook,
  stockPriceMissingExcelFileName,
} from "@/lib/stock-price-missing/workbook";

const sampleScan = {
  companyId: "c1",
  erp1: {
    label: "Cosmetics ERP1",
    rows: [
      {
        sku: "A-1",
        itemName: "Item A",
        locations: [{ locationLabel: "Online", stock: 2 }],
        totalStock: 2,
        standardRate: null,
        ogfRate: "100.00",
        gap: "Standard" as const,
      },
      {
        sku: "A-2",
        itemName: "Item A2",
        locations: [{ locationLabel: "Kandy", stock: 1 }],
        totalStock: 1,
        standardRate: null,
        ogfRate: null,
        gap: "Both" as const,
      },
    ],
    missingStandardCount: 1,
    missingOgfCount: 0,
    missingBothCount: 1,
  },
  erp2: {
    label: "LWK ERP2",
    rows: [
      {
        sku: "B-1",
        itemName: "Item B",
        locations: [{ locationLabel: "LWK", stock: 5 }],
        totalStock: 5,
        standardRate: "900.00",
        ogfRate: null,
        gap: "OGF" as const,
      },
    ],
    missingStandardCount: 0,
    missingOgfCount: 1,
    missingBothCount: 0,
  },
  standardMismatches: [
    {
      sku: "C-1",
      itemName: "Item C",
      erp1Rate: "1500.00",
      erp2Rate: "1400.00",
      diff: "100.00",
    },
  ],
};

describe("classifyPriceGap", () => {
  it("labels Standard / OGF / Both", () => {
    expect(classifyPriceGap({ hasStandard: true, hasOgf: true })).toBeNull();
    expect(classifyPriceGap({ hasStandard: false, hasOgf: true })).toBe("Standard");
    expect(classifyPriceGap({ hasStandard: true, hasOgf: false })).toBe("OGF");
    expect(classifyPriceGap({ hasStandard: false, hasOgf: false })).toBe("Both");
  });
});

describe("formatLocationsCell", () => {
  it("joins location stocks", () => {
    expect(
      formatLocationsCell([
        { locationLabel: "LWK", stock: 3 },
        { locationLabel: "Kandy", stock: 8 },
      ]),
    ).toBe("LWK: 3, Kandy: 8");
  });
});

describe("buildStockPriceMissingEmailContent", () => {
  it("renders ERP1 and ERP2 sections", () => {
    const builtin = builtinTemplateByKey(STOCK_PRICE_MISSING_DAILY_KEY)!;
    const built = buildStockPriceMissingEmailContent({
      companyName: "Cosmetics.lk",
      subjectTemplate: builtin.subject,
      bodyHtmlTemplate: builtin.bodyHtml,
      now: new Date("2026-09-22T04:00:00.000Z"),
      scan: sampleScan,
    });
    expect(built.subject).toContain("ERP1 2");
    expect(built.subject).toContain("ERP2 1");
    expect(built.html).toContain("Cosmetics ERP1");
    expect(built.html).toContain("LWK ERP2");
    expect(built.html).toContain("VAT - Selling is optional");
    expect(built.html).toContain("A-1");
    expect(built.html).toContain("B-1");
    expect(built.subject).toContain("std mismatch 1");
    expect(built.html).toContain("Standard Selling mismatch");
    expect(built.html).toContain("C-1");
    expect(built.html).toContain("1500.00");
    expect(built.html).toContain("1400.00");
  });

  it("appends mismatch section when a saved template lacks the placeholder", () => {
    const built = buildStockPriceMissingEmailContent({
      companyName: "Cosmetics.lk",
      subjectTemplate: "{{reportDate}} — gaps ERP1 {{erp1Count}}",
      bodyHtmlTemplate: "<p>ERP1 {{erp1Count}}</p><p>Cosmo OS automated report.</p>",
      now: new Date("2026-09-22T04:00:00.000Z"),
      scan: sampleScan,
    });
    expect(built.subject).toContain("std mismatch 1");
    expect(built.html).toContain("C-1");
    expect(built.html.indexOf("C-1")).toBeLessThan(built.html.indexOf("Cosmo OS automated report"));
  });
});

describe("buildStockPriceMissingWorkbook", () => {
  it("writes one sheet per ERP with fixed names", () => {
    const buffer = buildStockPriceMissingWorkbook(sampleScan);
    const wb = XLSX.read(buffer, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["ERP1", "ERP2", "Std mismatch"]);
    const sheet2 = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets["ERP2"]!,
    );
    expect(sheet2[0]?.SKU).toBe("B-1");
    expect(sheet2[0]?.Gap).toBe("OGF");
    const mismatch = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets["Std mismatch"]!,
    );
    expect(mismatch[0]?.SKU).toBe("C-1");
    expect(mismatch[0]?.["ERP1 Standard Selling"]).toBe("1500.00");
    expect(mismatch[0]?.["ERP2 Standard Selling"]).toBe("1400.00");
  });

  it("builds safe file name", () => {
    expect(stockPriceMissingExcelFileName("Sep 22, 2026")).toBe(
      "selling-price-gaps-Sep-22-2026.xlsx",
    );
  });
});
