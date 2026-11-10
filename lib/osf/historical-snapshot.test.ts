import { describe, expect, it } from "vitest";

import {
  isOsfHistoricalAsOf,
  osfSheetSalesQty,
  stockAsOfFromLaterMovements,
} from "@/lib/osf/historical-snapshot";

describe("isOsfHistoricalAsOf", () => {
  it("is true only for a valid date before today", () => {
    expect(isOsfHistoricalAsOf("2026-09-10", "2026-11-10")).toBe(true);
    expect(isOsfHistoricalAsOf("2026-11-10", "2026-11-10")).toBe(false);
    expect(isOsfHistoricalAsOf("2026-11-11", "2026-11-10")).toBe(false);
    expect(isOsfHistoricalAsOf("09-10-2026", "2026-11-10")).toBe(false);
  });
});

describe("stockAsOfFromLaterMovements", () => {
  it("subtracts ledger qty posted after the as-of day from the current bin", () => {
    const current = new Map<string, number>([
      ["Main - WH::CAN07_1", 4],
      ["Shop - WH::CAN07_1", 0],
      ["Main - WH::GONE", 2],
    ]);
    const after = new Map<string, number>([
      ["Main - WH::CAN07_1", -6],
      ["Shop - WH::CAN07_1", 3],
      ["Main - WH::NEW", 5],
    ]);
    const asOf = stockAsOfFromLaterMovements(current, after);
    expect(asOf.get("Main - WH::CAN07_1")).toBe(10);
    expect(asOf.get("Shop - WH::CAN07_1")).toBe(-3);
    expect(asOf.get("Main - WH::GONE")).toBe(2);
    expect(asOf.get("Main - WH::NEW")).toBe(-5);
  });
});

describe("osfSheetSalesQty", () => {
  it("keeps the clipped grid qty for the as-of month", () => {
    expect(
      osfSheetSalesQty({
        historical: true,
        month: "2026-09",
        asOfDate: "2026-09-10",
        gridQty: 40,
        fullMonthQty: 100,
      }),
    ).toBe(40);
  });

  it("does not fill the as-of month from the unclipped full month", () => {
    expect(
      osfSheetSalesQty({
        historical: true,
        month: "2026-09",
        asOfDate: "2026-09-10",
        gridQty: undefined,
        fullMonthQty: 100,
      }),
    ).toBe(0);
  });

  it("uses the full month when that month ended before as-of", () => {
    expect(
      osfSheetSalesQty({
        historical: true,
        month: "2026-08",
        asOfDate: "2026-09-10",
        gridQty: undefined,
        fullMonthQty: 12,
      }),
    ).toBe(12);
  });

  it("leaves a month after as-of empty", () => {
    expect(
      osfSheetSalesQty({
        historical: true,
        month: "2026-11",
        asOfDate: "2026-09-10",
        gridQty: undefined,
        fullMonthQty: 9,
      }),
    ).toBeNull();
  });
});
