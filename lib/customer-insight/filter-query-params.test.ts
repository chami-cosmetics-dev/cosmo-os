import { describe, expect, it } from "vitest";

import {
  appendInsightFilterList,
  normalizeInsightFilterList,
  readInsightFilterList,
} from "@/lib/customer-insight/filter-query-params";
import { lineMatchesHistoryScope } from "@/lib/customer-insight/history-scope";

describe("filter-query-params", () => {
  it("dedupes and trims repeated values", () => {
    expect(normalizeInsightFilterList([" Anua ", "anua", "Cosrx"])).toEqual([
      "Anua",
      "Cosrx",
    ]);
  });

  it("reads repeated query params", () => {
    const params = new URLSearchParams();
    params.append("brand", "Anua");
    params.append("brand", "Cosrx");
    expect(readInsightFilterList(params, "brand")).toEqual(["Anua", "Cosrx"]);
  });

  it("appends each selected value", () => {
    const params = new URLSearchParams();
    appendInsightFilterList(params, "item", ["Serum A", "Serum B"]);
    expect(params.getAll("item")).toEqual(["Serum A", "Serum B"]);
  });
});

describe("history-scope multi-select", () => {
  it("matches any selected brand or item", () => {
    expect(
      lineMatchesHistoryScope(
        { productTitle: "Anua Serum", brand: "Anua" },
        { brands: ["Anua", "Cosrx"] }
      )
    ).toBe(true);
    expect(
      lineMatchesHistoryScope(
        { productTitle: "Other Serum", brand: "Other" },
        { brands: ["Anua", "Cosrx"] }
      )
    ).toBe(false);
    expect(
      lineMatchesHistoryScope(
        { productTitle: "Peach Serum — 30ml", sku: "SKU-1" },
        { items: ["Peach Serum — 30ml", "Other Item"] }
      )
    ).toBe(true);
  });
});
