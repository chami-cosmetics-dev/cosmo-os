import { describe, expect, it } from "vitest";

import {
  findTransferLine,
  removeTransferLine,
  setTransferLineQty,
  upsertTransferLine,
} from "@/lib/material-transfer/lines";
import type { TransferLookupItem } from "@/lib/material-transfer/types";

function item(overrides: Partial<TransferLookupItem> = {}): TransferLookupItem {
  return {
    itemCode: "NEH09_1",
    itemName: "Neutrogena SPF 100",
    barcode: "062600656827",
    uom: "Nos",
    taxStatus: "Vat",
    availableQty: 3,
    ...overrides,
  };
}

describe("transfer lines", () => {
  it("adds a new scan at qty 1 and increments the same barcode", () => {
    const first = upsertTransferLine([], item());
    expect(first).toHaveLength(1);
    expect(first[0]?.qty).toBe(1);
    const again = upsertTransferLine(first, item());
    expect(again).toHaveLength(1);
    expect(again[0]?.qty).toBe(2);
    expect(findTransferLine(again, "062600656827")?.itemCode).toBe("NEH09_1");
    expect(findTransferLine(again, "neh09_1")?.qty).toBe(2);
  });

  it("keeps a manual qty and can remove the line", () => {
    const lines = setTransferLineQty(upsertTransferLine([], item()), "NEH09_1", 5);
    expect(lines[0]?.qty).toBe(5);
    expect(setTransferLineQty(lines, "NEH09_1", 0)[0]?.qty).toBe(5);
    expect(removeTransferLine(lines, "NEH09_1")).toEqual([]);
  });
});
