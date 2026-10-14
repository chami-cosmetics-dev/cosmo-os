import { describe, expect, it } from "vitest";

import { resolveShopToMain, type ShopReturnWarehouse } from "@/lib/material-transfer/shop-return";

function warehouse(
  name: string,
  company: string,
  slot: ShopReturnWarehouse["slot"],
): ShopReturnWarehouse {
  return { name, company, slot };
}

describe("resolveShopToMain", () => {
  it("returns the outlet shop and that company's main warehouse", () => {
    const result = resolveShopToMain("Maharagama", [
      warehouse("Maharagama Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Negombo Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
    ]);
    expect(result).toEqual({
      ok: true,
      slot: "erp1",
      erpCompany: "Cosmetics.lk",
      sourceWarehouse: "Maharagama Shop Warehouse - Cosmo",
      targetWarehouse: "Main Warehouse - Cosmo",
    });
  });

  it("keeps the cosmetics shop when an ERP2 company code also matches the outlet", () => {
    const result = resolveShopToMain("Pepiliyana", [
      warehouse("Pepiliyana Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Shop Warehouse - LMJ", "LMJ International", "erp2"),
      warehouse("Main Warehouse - LMJ", "LMJ International", "erp2"),
    ]);
    expect(result).toEqual({
      ok: true,
      slot: "erp1",
      erpCompany: "Cosmetics.lk",
      sourceWarehouse: "Pepiliyana Shop Warehouse - Cosmo",
      targetWarehouse: "Main Warehouse - Cosmo",
    });
  });

  it("uses the MNK alias for Cool Planet", () => {
    const result = resolveShopToMain("Cool Planet", [
      warehouse("Shop Warehouse - MNK", "MNK Trading", "erp2"),
      warehouse("Main Warehouse - MNK", "MNK Trading", "erp2"),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceWarehouse).toBe("Shop Warehouse - MNK");
      expect(result.targetWarehouse).toBe("Main Warehouse - MNK");
    }
  });

  it("refuses when no shop, two shops, or two mains match", () => {
    expect(resolveShopToMain("Unknown Outlet", []).ok).toBe(false);
    const twoShops = resolveShopToMain("Maharagama", [
      warehouse("Maharagama Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Maharagama Shop Warehouse - Other", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
    ]);
    expect(twoShops.ok).toBe(false);
    const twoMains = resolveShopToMain("Maharagama", [
      warehouse("Maharagama Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse 2 - Cosmo", "Cosmetics.lk", "erp1"),
    ]);
    expect(twoMains.ok).toBe(false);
  });
});
