import { describe, expect, it } from "vitest";

import type { SessionItem } from "@/lib/store-allocation/session-types";
import {
  buildNonEmptyLocationSteps,
  clampWalkthroughIndex,
} from "@/lib/store-allocation/walkthrough";

function item(
  sku: string,
  locations: Array<{ columnKey: string; label: string; qty: number }>,
): SessionItem {
  return {
    sku,
    barcode: null,
    description: `${sku} desc`,
    companyReorderQty: 50,
    itemStatusCategory: "CONTINUE",
    itemStatusLabel: "Continue",
    needsContinue: false,
    takeQty: 10,
    shortShipment: true,
    erpAvailable: true,
    planStatus: "ready",
    locations: locations.map((l) => ({
      columnKey: l.columnKey,
      label: l.label,
      locationRop: 10,
      stock: 0,
      need: 10,
      sales90d: 1,
      suggestedQty: l.qty,
      qty: l.qty,
    })),
  };
}

describe("buildNonEmptyLocationSteps", () => {
  it("skips locations where every item qty is 0", () => {
    const steps = buildNonEmptyLocationSteps([
      item("A", [
        { columnKey: "x", label: "X", qty: 5 },
        { columnKey: "y", label: "Y", qty: 0 },
        { columnKey: "z", label: "Z", qty: 5 },
      ]),
      item("B", [
        { columnKey: "x", label: "X", qty: 0 },
        { columnKey: "y", label: "Y", qty: 0 },
        { columnKey: "z", label: "Z", qty: 3 },
      ]),
    ]);
    expect(steps.map((s) => s.columnKey)).toEqual(["x", "z"]);
    expect(steps[0]!.lines.map((l) => l.sku)).toEqual(["A"]);
    expect(steps[1]!.lines.map((l) => `${l.sku}:${l.qty}`)).toEqual(["A:5", "B:3"]);
    expect(steps[0]!.index).toBe(0);
    expect(steps[0]!.total).toBe(2);
  });

  it("omits items without take qty or ready plan", () => {
    const idle: SessionItem = {
      ...item("C", [{ columnKey: "x", label: "X", qty: 9 }]),
      takeQty: null,
      planStatus: "idle",
      locations: [],
    };
    const steps = buildNonEmptyLocationSteps([
      item("A", [{ columnKey: "x", label: "X", qty: 2 }]),
      idle,
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.lines.map((l) => l.sku)).toEqual(["A"]);
  });

  it("returns empty when nothing to walk", () => {
    expect(buildNonEmptyLocationSteps([])).toEqual([]);
  });
});

describe("clampWalkthroughIndex", () => {
  it("clamps within bounds", () => {
    expect(clampWalkthroughIndex(-1, 3)).toBe(0);
    expect(clampWalkthroughIndex(9, 3)).toBe(2);
    expect(clampWalkthroughIndex(1, 0)).toBe(0);
  });
});
