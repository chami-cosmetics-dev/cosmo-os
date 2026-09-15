import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  looksLikeImportPhone,
  parseCallQueueImportPhones,
} from "@/lib/customer-insight/call-queue-import";
import { callQueueImportPhoneKey } from "@/lib/customer-insight/call-queue";

function workbookBuffer(
  rows: Array<Record<string, string | number>>,
  sheetName = "Sheet1"
) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseCallQueueImportPhones", () => {
  it("reads Phone column and splits multi-phone cells", () => {
    const buffer = workbookBuffer([
      { Merchant: "MER91", Name: "A", Phone: "0771234567; 0711111111" },
      { Merchant: "MER91", Name: "B", Phone: "0722222222" },
    ]);
    const result = parseCallQueueImportPhones(buffer, "queue.xlsx");
    expect(result.phones).toEqual(["0771234567", "0711111111", "0722222222"]);
    expect(result.skippedBlank).toBe(0);
    expect(result.usedFallbackColumn).toBe(false);
  });

  it("falls back to first column when no phone header", () => {
    const buffer = workbookBuffer([{ Numbers: "0779999999" }, { Numbers: "name only" }]);
    // Force no phone header by renaming — Numbers is not a phone header,
    // so fallback uses col 0 including header row values that look like phones.
    const result = parseCallQueueImportPhones(buffer, "queue.xlsx");
    expect(result.usedFallbackColumn).toBe(true);
    expect(result.phones).toContain("0779999999");
  });

  it("skips blank and non-phone rows", () => {
    const buffer = workbookBuffer([
      { Phone: "0771234567" },
      { Phone: "" },
      { Phone: "Alice" },
    ]);
    const result = parseCallQueueImportPhones(buffer, "queue.xlsx");
    expect(result.phones).toEqual(["0771234567"]);
    expect(result.skippedBlank).toBeGreaterThanOrEqual(2);
  });
});

describe("looksLikeImportPhone", () => {
  it("accepts local mobiles", () => {
    expect(looksLikeImportPhone("0771234567")).toBe(true);
    expect(looksLikeImportPhone("Alice")).toBe(false);
  });
});

describe("callQueueImportPhoneKey", () => {
  it("canonicalizes Sri Lanka mobiles", () => {
    expect(callQueueImportPhoneKey("0771234567")).toBe("0771234567");
    expect(callQueueImportPhoneKey("+94771234567")).toBe("0771234567");
    expect(callQueueImportPhoneKey("")).toBeNull();
  });
});
