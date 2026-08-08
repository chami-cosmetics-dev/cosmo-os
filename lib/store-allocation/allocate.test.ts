import { describe, expect, it } from "vitest";

import { allocateTakeQty } from "@/lib/store-allocation/allocate";

describe("allocateTakeQty", () => {
  it("returns zeros when takeQty is 0", () => {
    const out = allocateTakeQty(0, [
      { key: "a", need: 10, sales: 5 },
      { key: "b", need: 10, sales: 1 },
    ]);
    expect(out.every((r) => r.qty === 0)).toBe(true);
  });

  it("sums exactly to takeQty on short shipment", () => {
    const out = allocateTakeQty(30, [
      { key: "a", need: 10, sales: 2 },
      { key: "b", need: 10, sales: 2 },
      { key: "c", need: 15, sales: 8 },
      { key: "d", need: 15, sales: 1 },
    ]);
    expect(out.reduce((s, r) => s + r.qty, 0)).toBe(30);
  });

  it("gives zero to zero-need while others still need", () => {
    const out = allocateTakeQty(20, [
      { key: "full", need: 0, sales: 100 },
      { key: "hungry", need: 20, sales: 1 },
    ]);
    expect(out.find((r) => r.key === "full")?.qty).toBe(0);
    expect(out.find((r) => r.key === "hungry")?.qty).toBe(20);
  });

  it("favors higher sales when needs are equal", () => {
    const out = allocateTakeQty(10, [
      { key: "hot", need: 10, sales: 20 },
      { key: "cold", need: 10, sales: 0 },
    ]);
    const hot = out.find((r) => r.key === "hot")!.qty;
    const cold = out.find((r) => r.key === "cold")!.qty;
    expect(hot + cold).toBe(10);
    expect(hot).toBeGreaterThan(cold);
  });

  it("does not exceed need while other needs remain", () => {
    const out = allocateTakeQty(15, [
      { key: "small", need: 5, sales: 100 },
      { key: "big", need: 20, sales: 1 },
    ]);
    expect(out.find((r) => r.key === "small")?.qty).toBeLessThanOrEqual(5);
    expect(out.reduce((s, r) => s + r.qty, 0)).toBe(15);
  });

  it("falls back to sales-only when all needs are zero", () => {
    const out = allocateTakeQty(10, [
      { key: "a", need: 0, sales: 9 },
      { key: "b", need: 0, sales: 1 },
    ]);
    expect(out.reduce((s, r) => s + r.qty, 0)).toBe(10);
    expect(out.find((r) => r.key === "a")!.qty).toBeGreaterThan(
      out.find((r) => r.key === "b")!.qty,
    );
  });

  it("equal split when all need and sales are zero", () => {
    const out = allocateTakeQty(4, [
      { key: "a", need: 0, sales: 0 },
      { key: "b", need: 0, sales: 0 },
    ]);
    expect(out.reduce((s, r) => s + r.qty, 0)).toBe(4);
    expect(out.find((r) => r.key === "a")?.qty).toBe(2);
    expect(out.find((r) => r.key === "b")?.qty).toBe(2);
  });

  it("short-shipment example shape: uneven need and sales still sums to take", () => {
    const out = allocateTakeQty(30, [
      { key: "A", need: 10, sales: 5 },
      { key: "B", need: 10, sales: 1 },
      { key: "C", need: 15, sales: 20 },
      { key: "D", need: 15, sales: 2 },
    ]);
    expect(out.reduce((s, r) => s + r.qty, 0)).toBe(30);
    for (const row of out) {
      const need = { A: 10, B: 10, C: 15, D: 15 }[row.key]!;
      expect(row.qty).toBeLessThanOrEqual(need);
    }
  });
});
