import { describe, expect, it } from "vitest";

import { mapAdaptHeaders, rowFromValues } from "@/lib/adapt-import/columns";
import { classifyAdaptRow, parseAdaptDate } from "@/lib/adapt-import/row-classify";

describe("parseAdaptDate", () => {
  it("parses D/M/YYYY", () => {
    const d = parseAdaptDate("8/8/2019");
    expect(d?.getFullYear()).toBe(2019);
    expect(d?.getMonth()).toBe(7);
    expect(d?.getDate()).toBe(8);
  });
});

describe("classifyAdaptRow", () => {
  const headers = mapAdaptHeaders([
    "sales_invoice_master_id",
    "sales_invoice_no",
    "sales_location_id",
    "location_name",
    "invoice_date",
    "customer_tp",
    "customer_email",
    "attention_name",
    "ttl_amount",
    "active_flag",
    "deleted_on",
    "KnownName",
  ]);

  it("skips deleted rows", () => {
    const row = rowFromValues(headers, [
      "1",
      "SI-1",
      "1",
      "Head Office",
      "1/1/2024",
      "0717111111",
      "a@b.com",
      "A",
      "100",
      "0",
      "2/1/2024",
      "Nimal",
    ]);
    expect(classifyAdaptRow(row)).toEqual({
      status: "skip",
      reason: "cancelled_or_deleted",
    });
  });

  it("skips rows without phone/email", () => {
    const row = rowFromValues(headers, [
      "2",
      "SI-2",
      "1",
      "Head Office",
      "1/1/2024",
      "",
      "",
      "A",
      "100",
      "1",
      "",
      "Nimal",
    ]);
    expect(classifyAdaptRow(row)).toEqual({
      status: "skip",
      reason: "no_identifier",
    });
  });

  it("accepts a good row", () => {
    const row = rowFromValues(headers, [
      "3",
      "SI-3",
      "1",
      "Head Office",
      "15/6/2024",
      "0717106114",
      "good@example.com",
      "Good",
      "1500",
      "1",
      "",
      "Nimal",
    ]);
    const result = classifyAdaptRow(row);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.enrichOnly).toBe(false);
      expect(result.phone).toBe("0717106114");
      expect(result.merchantKnownName).toBe("Nimal");
      expect(result.ttlAmount).toBe("1500");
    }
  });
});
