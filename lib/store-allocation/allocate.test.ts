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

  it("boosts priority without starving lower priority locations", () => {
    const out = allocateTakeQty(10, [
      { key: "website", need: 10, sales: 2, priority: 1 },
      { key: "outlet", need: 10, sales: 2, priority: 2 },
      { key: "marketplace", need: 10, sales: 2, priority: 3 },
    ]);
    const website = out.find((r) => r.key === "website")!.qty;
    const outlet = out.find((r) => r.key === "outlet")!.qty;
    const marketplace = out.find((r) => r.key === "marketplace")!.qty;

    expect(out.reduce((s, r) => s + r.qty, 0)).toBe(10);
    expect(website).toBeGreaterThan(outlet);
    expect(outlet).toBeGreaterThan(marketplace);
    expect(marketplace).toBeGreaterThan(0);
  });

  it("gives every Priority 1 location up to three units first", () => {
    const out = allocateTakeQty(10, [
      { key: "priority-1-a", need: 0, sales: 0, priority: 1 },
      { key: "priority-1-b", need: 0, sales: 0, priority: 1 },
      { key: "priority-2", need: 0, sales: 0, priority: 2 },
    ]);

    expect(out).toEqual([
      { key: "priority-1-a", qty: 5 },
      { key: "priority-1-b", qty: 4 },
      { key: "priority-2", qty: 1 },
    ]);
    expect(out[0].qty).toBeGreaterThanOrEqual(3);
    expect(out[1].qty).toBeGreaterThanOrEqual(3);
  });

  it("reserves up to three units for every priority one location", () => {
    const out = allocateTakeQty(20, [
      { key: "website", need: 0, sales: 0, priority: 1 },
      { key: "main-online", need: 0, sales: 0, priority: 1 },
      { key: "outlet", need: 100, sales: 10, priority: 2 },
    ]);
    expect(out.find((row) => row.key === "website")?.qty).toBeGreaterThanOrEqual(3);
    expect(out.find((row) => row.key === "main-online")?.qty).toBeGreaterThanOrEqual(3);
    expect(out.reduce((sum, row) => sum + row.qty, 0)).toBe(20);
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
