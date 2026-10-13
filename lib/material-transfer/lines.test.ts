import { describe, expect, it } from "vitest";

import {
  findTransferLine,
  promoteTransferLine,
  removeTransferLine,
  setTransferLineQty,
  upsertTransferLine,
} from "@/lib/material-transfer/lines";
import type { TransferLine, TransferLookupItem } from "@/lib/material-transfer/types";

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

function line(itemCode: string, qty: number): TransferLine {
  return {
    itemCode,
    itemName: itemCode,
    barcode: "",
    uom: "Nos",
    qty,
    availableQty: 5,
  };
}

describe("transfer lines", () => {
  it("adds a new scan at qty 1 and increments the same barcode", () => {
    const first = upsertTransferLine([], item());
    expect(first.rejected).toBeNull();
    expect(first.lines).toHaveLength(1);
    expect(first.lines[0]?.qty).toBe(1);
    const again = upsertTransferLine(first.lines, item());
    expect(again.lines).toHaveLength(1);
    expect(again.lines[0]?.qty).toBe(2);
    expect(findTransferLine(again.lines, "062600656827")?.itemCode).toBe("NEH09_1");
    expect(findTransferLine(again.lines, "neh09_1")?.qty).toBe(2);
  });

  it("keeps a manual qty and can remove the line", () => {
    const added = upsertTransferLine([], item({ availableQty: 5 }));
    const lines = setTransferLineQty(added.lines, "NEH09_1", 5);
    expect(lines.rejected).toBeNull();
    expect(lines.lines[0]?.qty).toBe(5);
    const zero = setTransferLineQty(lines.lines, "NEH09_1", 0);
    expect(zero.rejected).toBeNull();
    expect(zero.lines[0]?.qty).toBe(5);
    expect(removeTransferLine(lines.lines, "NEH09_1")).toEqual([]);
  });

  it("refuses a scan or typed qty above available", () => {
    let lines = upsertTransferLine([], item()).lines;
    lines = upsertTransferLine(lines, item()).lines;
    lines = upsertTransferLine(lines, item()).lines;
    expect(lines[0]?.qty).toBe(3);
    const scanned = upsertTransferLine(lines, item());
    expect(scanned.rejected).toBe("over_available");
    expect(scanned.lines[0]?.qty).toBe(3);
    const typed = setTransferLineQty(lines, "NEH09_1", 4);
    expect(typed.rejected).toBe("over_available");
    expect(typed.lines[0]?.qty).toBe(3);
  });

  it("does not add a line when available is 0", () => {
    const result = upsertTransferLine([], item({ availableQty: 0 }));
    expect(result.rejected).toBe("over_available");
    expect(result.lines).toEqual([]);
  });

  it("ignores a non-integer qty without reporting over available", () => {
    const added = upsertTransferLine([], item());
    const result = setTransferLineQty(added.lines, "NEH09_1", 1.5);
    expect(result.rejected).toBeNull();
    expect(result.lines[0]?.qty).toBe(1);
  });

  it("allows a high qty when available is unknown", () => {
    const added = upsertTransferLine([], item({ availableQty: null }));
    const result = setTransferLineQty(added.lines, "NEH09_1", 50);
    expect(result.rejected).toBeNull();
    expect(result.lines[0]?.qty).toBe(50);
  });

  it("moves the scanned item to the front", () => {
    const lines = [line("A", 1), line("B", 2)];
    expect(promoteTransferLine(lines, "B").map((row) => row.itemCode)).toEqual(["B", "A"]);
    expect(promoteTransferLine(lines, "A")).toBe(lines);
  });
});
