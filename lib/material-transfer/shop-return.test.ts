import { describe, expect, it } from "vitest";

import {
  resolveShopToMain,
  shopReturnDestination,
  shopReturnHeader,
  type ShopReturnWarehouse,
} from "@/lib/material-transfer/shop-return";

function warehouse(
  name: string,
  company: string,
  slot: ShopReturnWarehouse["slot"],
): ShopReturnWarehouse {
  return { name, company, slot };
}

describe("shop return split", () => {
  it("sends VAT items to ERP1 and other items to ERP2", () => {
    expect(shopReturnDestination("Vat")).toBe("erp1");
    expect(shopReturnDestination("Vat / Non Vat")).toBe("erp1");
    expect(shopReturnDestination("Non Vat")).toBe("erp2");
    expect(shopReturnDestination("")).toBe("erp2");
  });

  it("builds one header when both ERPs have lines", () => {
    const header = shopReturnHeader(
      [
        {
          slot: "erp1",
          erpCompany: "Cosmetics.lk",
          sourceWarehouse: "Maharagama Shop Warehouse - Cosmo",
          targetWarehouse: "Main Warehouse - Cosmo",
        },
        {
          slot: "erp2",
          erpCompany: "MNK Trading",
          sourceWarehouse: "Maharagama Shop Warehouse - MNK",
          targetWarehouse: "Main Warehouse - MNK",
        },
      ],
      ["erp1", "erp2"],
    );
    expect(header.ok).toBe(true);
    if (header.ok) {
      expect(header.slot).toBe("mixed");
      expect(header.sourceWarehouse).toBe("Maharagama Shop Warehouse - Cosmo");
      expect(header.sourceWarehouse2).toBe("Maharagama Shop Warehouse - MNK");
    }
  });
});

describe("resolveShopToMain", () => {
  it("returns the outlet shop and that company's main warehouse", () => {
    const result = resolveShopToMain("Maharagama", [
      warehouse("Maharagama Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Negombo Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
    ]);
    expect(result).toEqual({
      ok: true,
      legs: [
        {
          slot: "erp1",
          erpCompany: "Cosmetics.lk",
          sourceWarehouse: "Maharagama Shop Warehouse - Cosmo",
          targetWarehouse: "Main Warehouse - Cosmo",
        },
      ],
    });
  });

  it("does not give Maharagama the MNK company warehouses", () => {
    const result = resolveShopToMain("Maharagama", [
      warehouse("Maharagama Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Maharagama Shop Warehouse - MNK", "MNK Trading", "erp2"),
      warehouse("Main Warehouse - MNK", "MNK Trading", "erp2"),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.legs.map((leg) => leg.slot)).toEqual(["erp1"]);
    }
  });

  it("sends Cool Planet VAT stock to the Cosmetics main and other items to the MNK main", () => {
    const result = resolveShopToMain("Cool Planet", [
      warehouse("Cool Planet Nugegoda Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse 2 - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Shop Warehouse - MNK", "MNK Trading", "erp2"),
      warehouse("Main Warehouse - MNK", "MNK Trading", "erp2"),
    ]);
    expect(result).toEqual({
      ok: true,
      legs: [
        {
          slot: "erp1",
          erpCompany: "Cosmetics.lk",
          sourceWarehouse: "Cool Planet Nugegoda Shop Warehouse - Cosmo",
          targetWarehouse: "Main Warehouse - Cosmo",
        },
        {
          slot: "erp2",
          erpCompany: "MNK Trading",
          sourceWarehouse: "Shop Warehouse - MNK",
          targetWarehouse: "Main Warehouse - MNK",
        },
      ],
    });
  });

  it("treats Galle as the GCC outlet and Chami as its ERP2 company", () => {
    const result = resolveShopToMain("Galle", [
      warehouse("GCC Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Pepiliyana Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Shop Warehouse - Chami", "Chami", "erp2"),
      warehouse("Main Warehouse - Chami", "Chami", "erp2"),
    ]);
    expect(result).toEqual({
      ok: true,
      legs: [
        {
          slot: "erp1",
          erpCompany: "Cosmetics.lk",
          sourceWarehouse: "GCC Shop Warehouse - Cosmo",
          targetWarehouse: "Main Warehouse - Cosmo",
        },
        {
          slot: "erp2",
          erpCompany: "Chami",
          sourceWarehouse: "Shop Warehouse - Chami",
          targetWarehouse: "Main Warehouse - Chami",
        },
      ],
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
      legs: [
        {
          slot: "erp1",
          erpCompany: "Cosmetics.lk",
          sourceWarehouse: "Cool Planet Nugegoda Shop Warehouse - Cosmo",
          targetWarehouse: "Main Warehouse - Cosmo",
        },
        {
          slot: "erp2",
          erpCompany: "MNK Trading",
          sourceWarehouse: "Shop Warehouse - MNK",
          targetWarehouse: "Main Warehouse - MNK",
        },
      ],
    });
    const pepiliyana = resolveShopToMain("Pepiliyana", [
      warehouse("Pepiliyana Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Shop Warehouse - LMJ", "LMJ International", "erp2"),
      warehouse("Main Warehouse - LMJ", "LMJ International", "erp2"),
    ]);
    expect(pepiliyana).toEqual({
      ok: true,
      legs: [
        {
          slot: "erp1",
          erpCompany: "Cosmetics.lk",
          sourceWarehouse: "Pepiliyana Shop Warehouse - Cosmo",
          targetWarehouse: "Main Warehouse - Cosmo",
        },
        {
          slot: "erp2",
          erpCompany: "LMJ International",
          sourceWarehouse: "Shop Warehouse - LMJ",
          targetWarehouse: "Main Warehouse - LMJ",
        },
      ],
    });
  });

  it("sends Maharagama from the DRO shop warehouse to the DRO main warehouse", () => {
    const result = resolveShopToMain("Maharagama", [
      warehouse("Maharagama Shop Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Main Warehouse - Cosmo", "Cosmetics.lk", "erp1"),
      warehouse("Shop Warehouse - DRO", "DRO", "erp2"),
      warehouse("Main Warehouse - DRO", "DRO", "erp2"),
      warehouse("Shop Warehouse - MNK", "MNK Trading", "erp2"),
      warehouse("Main Warehouse - MNK", "MNK Trading", "erp2"),
    ]);
    expect(result).toEqual({
      ok: true,
      legs: [
        {
          slot: "erp1",
          erpCompany: "Cosmetics.lk",
          sourceWarehouse: "Maharagama Shop Warehouse - Cosmo",
          targetWarehouse: "Main Warehouse - Cosmo",
        },
        {
          slot: "erp2",
          erpCompany: "DRO",
          sourceWarehouse: "Shop Warehouse - DRO",
          targetWarehouse: "Main Warehouse - DRO",
        },
      ],
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
    expect(twoMains.ok).toBe(true);
    if (twoMains.ok) {
      expect(twoMains.legs[0]?.targetWarehouse).toBe("Main Warehouse - Cosmo");
    }
    const twoErp2Mains = resolveShopToMain("Cool Planet", [
      warehouse("Shop Warehouse - MNK", "MNK Trading", "erp2"),
      warehouse("Main Warehouse - MNK", "MNK Trading", "erp2"),
      warehouse("Main Warehouse 2 - MNK", "MNK Trading", "erp2"),
    ]);
    expect(twoErp2Mains.ok).toBe(false);
  });
});
