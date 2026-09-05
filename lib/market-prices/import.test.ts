import { describe, expect, it } from "vitest";

import {
  parseCsvDate,
  parseInStock,
  parseRawImportCsv,
} from "./import";

describe("CSV Import Helpers", () => {
  describe("parseCsvDate", () => {
    it("parses YYYY-MM-DD correctly", () => {
      expect(parseCsvDate("2026-09-01")).toBe("2026-09-01");
      expect(parseCsvDate("2025-12-31")).toBe("2025-12-31");
    });

    it("parses DD/MM/YYYY into YYYY-MM-DD", () => {
      expect(parseCsvDate("01/09/2026")).toBe("2026-09-01");
      expect(parseCsvDate("5/4/2026")).toBe("2026-04-05");
    });

    it("returns null for invalid dates", () => {
      expect(parseCsvDate("invalid-date")).toBeNull();
      expect(parseCsvDate("")).toBeNull();
      expect(parseCsvDate(null)).toBeNull();
    });
  });

  describe("parseInStock", () => {
    it("recognizes affirmative values as true", () => {
      expect(parseInStock("yes")).toBe(true);
      expect(parseInStock("Y")).toBe(true);
      expect(parseInStock("true")).toBe(true);
      expect(parseInStock("1")).toBe(true);
      expect(parseInStock("")).toBe(true); // default true
      expect(parseInStock(null)).toBe(true);
    });

    it("recognizes negative values as false", () => {
      expect(parseInStock("no")).toBe(false);
      expect(parseInStock("N")).toBe(false);
      expect(parseInStock("false")).toBe(false);
      expect(parseInStock("0")).toBe(false);
      expect(parseInStock("out of stock")).toBe(false);
      expect(parseInStock("out_of_stock")).toBe(false);
    });
  });

  describe("parseRawImportCsv", () => {
    it("parses CSV lines into structured records with normalized headers", () => {
      const csv = `sku,Competitor,Price LKR,In Stock,Check Date
CERAVE-236,Liberty Store,8200,yes,2026-09-01
# Comment line to ignore
ORDINARY-01,Essentials,4500,no,2026-08-25`;

      const result = parseRawImportCsv(csv);
      expect(result.headers).toEqual(["sku", "competitor", "price_lkr", "in_stock", "check_date"]);
      expect(result.records).toHaveLength(2);
      expect(result.records[0].row).toEqual({
        sku: "CERAVE-236",
        competitor: "Liberty Store",
        price_lkr: "8200",
        in_stock: "yes",
        check_date: "2026-09-01",
      });
      expect(result.records[1].row).toEqual({
        sku: "ORDINARY-01",
        competitor: "Essentials",
        price_lkr: "4500",
        in_stock: "no",
        check_date: "2026-08-25",
      });
    });

    it("handles quoted fields with commas", () => {
      const csv = `sku,competitor_title,price_lkr
CERAVE-236,"CeraVe Lotion, 236ml with pump",8200`;

      const result = parseRawImportCsv(csv);
      expect(result.records[0].row.competitor_title).toBe("CeraVe Lotion, 236ml with pump");
    });
  });
});
