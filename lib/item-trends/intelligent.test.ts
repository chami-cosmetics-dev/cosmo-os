import { describe, expect, it } from "vitest";

import { computeIntelligentSignals } from "@/lib/item-trends/intelligent";
import type { ItemMovementRow } from "@/lib/item-trends/types";

const baseRow = (sku: string, signal: ItemMovementRow["signal"] = "none"): ItemMovementRow => ({
  sku,
  title: null,
  priority: "Top Priority",
  unitsCurrent: 10,
  unitsPrior: 5,
  speedPerDay: 1,
  speedChangePct: 50,
  signal,
  signalSource: "rule_based",
  sparkline: [],
});

describe("computeIntelligentSignals", () => {
  it("flags emerging trend from rising weekly buckets", () => {
    const daily = [...Array(7).fill(1), ...Array(7).fill(2), ...Array(7).fill(4), ...Array(7).fill(6)];
    const signals = computeIntelligentSignals([baseRow("SKU1")], new Map([["SKU1", daily]]));
    expect(signals.some((s) => s.signal === "emerging")).toBe(true);
  });

  it("returns empty when insufficient history", () => {
    const signals = computeIntelligentSignals([baseRow("SKU2")], new Map([["SKU2", [1, 2, 3]]]));
    expect(signals).toHaveLength(0);
  });
});
