import { describe, expect, it } from "vitest";

import { linesBelowMainAvailable } from "@/lib/material-transfer/submit-review";

const lines = [
  { itemCode: "LOW", qty: 2, availableQty: 5 },
  { itemCode: "FULL", qty: 5, availableQty: 5 },
  { itemCode: "UNKNOWN", qty: 1, availableQty: null },
];

describe("linesBelowMainAvailable", () => {
  it("marks only lines under the main warehouse available qty", () => {
    const marked = linesBelowMainAvailable("Main Warehouse - Cosmo", lines);
    expect(marked.map((line) => line.itemCode)).toEqual(["LOW"]);
  });

  it("marks nothing when the source is not a main warehouse", () => {
    expect(linesBelowMainAvailable("Maharagama Shop Warehouse - Cosmo", lines)).toEqual([]);
  });
});
