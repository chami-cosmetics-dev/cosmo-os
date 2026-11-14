import { describe, expect, it } from "vitest";

import { buildDiscontinueMovement, type SkuStatus } from "@/lib/stock-health/discontinue-movement";

const s = (commonSku: string, status: SkuStatus["status"]): SkuStatus => ({ commonSku, status, itemName: `${commonSku} name` });

describe("buildDiscontinueMovement", () => {
  it("10 Discontinue → 3 to Top, 2 to Low, 3 new with no earlier priority = 8 (the example)", () => {
    const previous = [
      ...["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"].map((k) => s(k, "Discontinue")),
      s("B1", "Blank"),
    ];
    const current = [
      s("D1", "Top"),
      s("D2", "Top"),
      s("D3", "Top"),
      s("D4", "Low"),
      s("D5", "Low"),
      ...["D6", "D7", "D8", "D9", "D10"].map((k) => s(k, "Discontinue")),
      s("N1", "Discontinue"), // new item
      s("N2", "Discontinue"), // new item
      s("B1", "Discontinue"), // Blank last week
    ];
    // D6–D10 stay, so this week = 5 + 3 errors = 8.
    const m = buildDiscontinueMovement(previous, current);
    expect(m.previousCount).toBe(10);
    expect(m.movedOut.Top.map((i) => i.commonSku)).toEqual(["D1", "D2", "D3"]);
    expect(m.movedOut.Low.map((i) => i.commonSku)).toEqual(["D4", "D5"]);
    expect(m.stayed).toBe(5);
    expect(m.systemErrors).toEqual([
      { commonSku: "B1", itemName: "B1 name", lastWeek: "Blank" },
      { commonSku: "N1", itemName: "N1 name", lastWeek: "New item" },
      { commonSku: "N2", itemName: "N2 name", lastWeek: "New item" },
    ]);
    expect(m.currentCount).toBe(8);
  });

  it("shows moves in from Top / Low / Newly Added as normal, and items no longer counted", () => {
    const m = buildDiscontinueMovement(
      [s("A", "Top"), s("B", "Newly Added"), s("C", "Discontinue")],
      [s("A", "Discontinue"), s("B", "Discontinue")],
    );
    expect(m.movedIn.Top.map((i) => i.commonSku)).toEqual(["A"]);
    expect(m.movedIn["Newly Added"].map((i) => i.commonSku)).toEqual(["B"]);
    expect(m.noLongerCounted.map((i) => i.commonSku)).toEqual(["C"]);
    expect(m.systemErrors).toEqual([]);
    // previous − out − no longer counted + in + errors = current
    expect(m.previousCount - 1 + 2).toBe(m.currentCount);
  });
});
