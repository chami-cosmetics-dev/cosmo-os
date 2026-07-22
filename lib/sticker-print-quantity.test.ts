import { describe, expect, it } from "vitest";

import {
  expandItemsByQuantity,
  normalizeQuantity,
  totalStickerCount,
} from "@/lib/sticker-print-quantity";

describe("normalizeQuantity", () => {
  it("keeps positive integers", () => {
    expect(normalizeQuantity(5)).toBe(5);
    expect(normalizeQuantity(1)).toBe(1);
  });

  it("floors non-integers and clamps non-positive to 1", () => {
    expect(normalizeQuantity(2.9)).toBe(2);
    expect(normalizeQuantity(0)).toBe(1);
    expect(normalizeQuantity(-3)).toBe(1);
    expect(normalizeQuantity(Number.NaN)).toBe(1);
  });
});

describe("expandItemsByQuantity", () => {
  it("expands quantity 1 to a single copy", () => {
    const items = [{ id: "a", quantity: 1 }];
    expect(expandItemsByQuantity(items)).toEqual([
      { item: items[0], copyIndex: 1 },
    ]);
  });

  it("expands quantity N to N copies", () => {
    const items = [{ id: "a", quantity: 5 }];
    const expanded = expandItemsByQuantity(items);
    expect(expanded).toHaveLength(5);
    expect(expanded.map((e) => e.copyIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(expanded.every((e) => e.item.id === "a")).toBe(true);
  });

  it("expands mixed lines independently", () => {
    const items = [
      { id: "a", quantity: 5 },
      { id: "b", quantity: 2 },
      { id: "c", quantity: 1 },
    ];
    const expanded = expandItemsByQuantity(items);
    expect(expanded).toHaveLength(8);
    expect(expanded.filter((e) => e.item.id === "a")).toHaveLength(5);
    expect(expanded.filter((e) => e.item.id === "b")).toHaveLength(2);
    expect(expanded.filter((e) => e.item.id === "c")).toHaveLength(1);
  });

  it("returns empty for empty list", () => {
    expect(expandItemsByQuantity([])).toEqual([]);
  });
});

describe("totalStickerCount", () => {
  it("sums quantities", () => {
    expect(totalStickerCount([])).toBe(0);
    expect(totalStickerCount([{ quantity: 1 }])).toBe(1);
    expect(
      totalStickerCount([
        { quantity: 5 },
        { quantity: 2 },
        { quantity: 1 },
      ])
    ).toBe(8);
  });

  it("matches expandItemsByQuantity length", () => {
    const items = [
      { quantity: 3 },
      { quantity: 4 },
    ];
    expect(totalStickerCount(items)).toBe(expandItemsByQuantity(items).length);
  });
});
