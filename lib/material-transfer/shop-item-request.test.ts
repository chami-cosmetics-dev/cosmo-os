import { describe, expect, it } from "vitest";

import {
  assertUniqueItemCodes,
  canMarkDone,
  resolveMainWarehouses,
  shopAvailabilityWarn,
  stockCell,
} from "@/lib/material-transfer/shop-item-request";

const named = [
  { name: "Main Warehouse - Cosmo", company: "Cosmetics.lk", slot: "erp1" as const },
  { name: "Main Warehouse - Cosmo", company: "Other", slot: "erp2" as const },
  { name: "Main Warehouse - Pevi", company: "Pevi Trading Lanka (Pvt) Ltd", slot: "erp2" as const },
  { name: "Main Warehouse - SPK", company: "SPK Trading", slot: "erp2" as const },
  { name: "Main Warehouse - Chami", company: "Chami Trading Lanka (Pvt) Ltd", slot: "erp2" as const },
  { name: "Main Warehouse - Udara", company: "Udara", slot: "erp2" as const },
  { name: "Main Warehouse - SDP", company: "SDP", slot: "erp2" as const },
  { name: "Shop Warehouse - Pevi", company: "Pevi Trading Lanka (Pvt) Ltd", slot: "erp2" as const },
];

describe("resolveMainWarehouses", () => {
  it("picks Cosmetics main only on erp1 and the preferred trading mains", () => {
    const resolved = resolveMainWarehouses(named);
    expect(resolved.find((row) => row.key === "cosmetics_main")?.warehouse).toBe("Main Warehouse - Cosmo");
    expect(resolved.find((row) => row.key === "cosmetics_main")?.slot).toBe("erp1");
    expect(resolved.find((row) => row.key === "pevi")?.warehouse).toBe("Main Warehouse - Pevi");
    expect(resolved.find((row) => row.key === "spk")?.warehouse).toBe("Main Warehouse - SPK");
    expect(resolved.find((row) => row.key === "chami")?.warehouse).toBe("Main Warehouse - Chami");
    expect(resolved.find((row) => row.key === "udara")?.warehouse).toBe("Main Warehouse - Udara");
    expect(resolved.find((row) => row.key === "sdp")?.warehouse).toBe("Main Warehouse - SDP");
  });

  it("falls back to the single main whose name or company contains the token", () => {
    const resolved = resolveMainWarehouses([
      { name: "Udara Main Store", company: "Holdings", slot: "erp2" },
    ]);
    expect(resolved.find((row) => row.key === "udara")?.warehouse).toBe("Udara Main Store");
    expect(resolved.find((row) => row.key === "pevi")?.warehouse).toBeNull();
  });

  it("leaves a column unknown when nothing matches or two mains match without the preferred name", () => {
    const none = resolveMainWarehouses([]);
    expect(none.every((row) => row.warehouse == null)).toBe(true);

    const two = resolveMainWarehouses([
      { name: "Main North Pevi", company: "A", slot: "erp2" },
      { name: "Main South Pevi", company: "B", slot: "erp2" },
    ]);
    expect(two.find((row) => row.key === "pevi")?.warehouse).toBeNull();
  });
});

describe("stockCell", () => {
  it("marks quantities below 4 and leaves 4 and unknown clear", () => {
    for (const qty of [0, 1, 2, 3]) {
      expect(stockCell(qty)).toEqual({ qty, cannotTransfer: true });
    }
    expect(stockCell(4)).toEqual({ qty: 4, cannotTransfer: false });
    expect(stockCell(null)).toEqual({ qty: null, cannotTransfer: false });
  });
});

describe("shop availability and request guards", () => {
  it("warns only for not_allowed", () => {
    expect(shopAvailabilityWarn("not_allowed")).toBe(true);
    expect(shopAvailabilityWarn("allowed")).toBe(false);
    expect(shopAvailabilityWarn(null)).toBe(false);
    expect(shopAvailabilityWarn("")).toBe(false);
  });

  it("rejects a repeated item code", () => {
    expect(() => assertUniqueItemCodes(["ACN01_1", "ACN01_1"])).toThrow(/Duplicate item ACN01_1/);
    expect(() => assertUniqueItemCodes(["ACN01_1", "ACN01_2"])).not.toThrow();
  });

  it("allows mark-done only while pending", () => {
    expect(canMarkDone("pending")).toBe(true);
    expect(canMarkDone("done")).toBe(false);
  });
});
