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

  it("sends a mapped outlet from that company's shop warehouse to its main warehouse", () => {
    const coolPlanet = resolveShopToMain("Cool Planet Nugegoda", [
      warehouse("Shop Warehouse - MNK", "MNK Trading", "erp2"),
      warehouse("Main Warehouse - MNK", "MNK Trading", "erp2"),
      warehouse("Cool Planet Nugegoda Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
    ]);
    expect(coolPlanet).toEqual({
      ok: true,
      slot: "erp2",
      erpCompany: "MNK Trading",
      sourceWarehouse: "Shop Warehouse - MNK",
      targetWarehouse: "Main Warehouse - MNK",
    });
    const pepiliyana = resolveShopToMain("Pepiliyana", [
      warehouse("Pepiliyana Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Shop Warehouse - LMJ", "LMJ International", "erp2"),
      warehouse("Main Warehouse - LMJ", "LMJ International", "erp2"),
    ]);
    expect(pepiliyana).toEqual({
      ok: true,
      slot: "erp2",
      erpCompany: "LMJ International",
      sourceWarehouse: "Shop Warehouse - LMJ",
      targetWarehouse: "Main Warehouse - LMJ",
    });
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
