import { describe, expect, it } from "vitest";

import {
  STOCK_PRICE_MISSING_DAILY_KEY,
  builtinTemplateByKey,
} from "@/lib/email-templates/catalog";
import {
  buildStockPriceMissingEmailContent,
  formatLocationsCell,
} from "@/lib/stock-price-missing/build-content";

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
  it("renders both sections", () => {
    const builtin = builtinTemplateByKey(STOCK_PRICE_MISSING_DAILY_KEY)!;
    const built = buildStockPriceMissingEmailContent({
      companyName: "Cosmetics.lk",
      subjectTemplate: builtin.subject,
      bodyHtmlTemplate: builtin.bodyHtml,
      now: new Date("2026-09-21T10:30:00.000Z"),
      scan: {
        companyId: "c1",
        rows: [
          {
            sku: "ABC-1",
            itemName: "Cream <50ml>",
            locations: [{ locationLabel: "Online", stock: 2 }],
            totalStock: 2,
            standardRate: null,
            ogfRate: null,
            gap: "Both",
          },
        ],
        erp2OgfMissingRows: [
          {
            sku: "XYZ-9",
            itemName: "Serum",
            locations: [{ locationLabel: "LWK", stock: 5 }],
            totalStock: 5,
            standardRate: "1200.00",
            ogfRate: null,
            gap: "OGF",
          },
        ],
        missingStandardCount: 0,
        missingOgfCount: 1,
        missingBothCount: 1,
        erp2OgfMissingCount: 1,
      },
    });
    expect(built.subject).toContain("no price 1");
    expect(built.subject).toContain("ERP2 OGF 1");
    expect(built.html).toContain("ABC-1");
    expect(built.html).toContain("XYZ-9");
    expect(built.html).toContain("1200.00");
    expect(built.html).toContain("VAT items excluded");
    expect(built.html).toContain("ERP2 — Standard present, OGF missing");
  });
});
