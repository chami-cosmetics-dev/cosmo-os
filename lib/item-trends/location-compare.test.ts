import { describe, expect, it } from "vitest";

import {
  availableCompareLocations,
  compareCoverByLocation,
  itemCoverRows,
} from "@/lib/item-trends/location-compare";
import type { CoverRow } from "@/lib/item-trends/types";

function row(partial: Partial<CoverRow> & Pick<CoverRow, "sku" | "columnKey" | "outletName">): CoverRow {
  return {
    title: "Lipstick",
    variantTitle: null,
    brand: "Brand",
    commonSkuKey: "prod-1",
    commonSkuTitle: "Lipstick",
    priority: "Top Priority",
    channelKind: "physical",
    unitsInRange: 0,
    daysInRange: 7,
    avgDaily: 0,
    weekNeed: 0,
    stockQty: 0,
    stockPctOfSale: null,
    stockPctOfWeek: null,
    coverDays: null,
    shouldSend: false,
    suggestedSendQty: 0,
    isOosInRange: false,
    ...partial,
  };
}

describe("itemCoverRows", () => {
  const rows = [
    row({ sku: "A-RED", columnKey: "gcc", outletName: "GCC", unitsInRange: 4, stockQty: 2 }),
    row({ sku: "A-NUDE", columnKey: "gcc", outletName: "GCC", unitsInRange: 6, stockQty: 1 }),
    row({ sku: "B", columnKey: "gcc", outletName: "GCC", commonSkuKey: "prod-2", unitsInRange: 9 }),
  ];

  it("filters one variant SKU", () => {
    expect(itemCoverRows(rows, { sku: "A-RED" }, "variant").map((r) => r.sku)).toEqual(["A-RED"]);
  });

  it("filters all variants of a common SKU", () => {
    expect(itemCoverRows(rows, { sku: "A-RED", commonSkuKey: "prod-1" }, "common")).toHaveLength(2);
  });
});

describe("compareCoverByLocation", () => {
  it("lets the user pick locations and rolls variants per shop", () => {
    const rows = [
      row({ sku: "A-RED", columnKey: "web", outletName: "Web", channelKind: "online", unitsInRange: 10, stockQty: 20 }),
      row({ sku: "A-RED", columnKey: "gcc", outletName: "GCC", unitsInRange: 4, stockQty: 2 }),
      row({ sku: "A-NUDE", columnKey: "gcc", outletName: "GCC", unitsInRange: 6, stockQty: 1 }),
      row({ sku: "A-RED", columnKey: "mnk", outletName: "MNK", unitsInRange: 1, stockQty: 0 }),
    ];
    const picked = compareCoverByLocation({
      rows,
      selectedColumnKeys: ["web", "gcc"],
    });
    expect(picked.map((r) => r.columnKey)).toEqual(["web", "gcc"]);
    const gcc = picked.find((r) => r.columnKey === "gcc");
    expect(gcc?.unitsInRange).toBe(10);
    expect(gcc?.stockQty).toBe(3);
  });

  it("lists locations online first", () => {
    const locs = availableCompareLocations([
      row({ sku: "A", columnKey: "gcc", outletName: "GCC" }),
      row({ sku: "A", columnKey: "web", outletName: "Web", channelKind: "online" }),
    ]);
    expect(locs.map((l) => l.columnKey)).toEqual(["web", "gcc"]);
  });
});
