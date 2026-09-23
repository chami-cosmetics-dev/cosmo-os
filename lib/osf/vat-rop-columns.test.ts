import { describe, expect, it } from "vitest";

import type { OsfResolvedColumn } from "@/lib/osf/column-config";
import {
  findCosmeticsLkRopColumn,
  selectVatRopColumns,
  selectVatStockColumns,
  totalRopForColumns,
  totalRopForVat,
} from "@/lib/osf/vat-rop-columns";

function col(partial: Partial<OsfResolvedColumn> & Pick<OsfResolvedColumn, "key" | "label">): OsfResolvedColumn {
  return {
    id: partial.key,
    companyLocationId: null,
    companyLocationName: null,
    erpnextInstanceId: null,
    directWarehouses: [],
    includeInStock: true,
    includeInRop: true,
    sortOrder: 0,
    active: true,
    warehouses: [],
    ...partial,
  };
}

describe("selectVatRopColumns", () => {
  const cosmetics = col({
    key: "cosmetics_lk",
    label: "Cosmetics.lk",
    companyLocationId: "loc_ck",
    companyLocationName: "Cosmetics.lk",
  });
  const shop = col({
    key: "cosmo_shop_gcc",
    label: "GCC Shop",
    directWarehouses: ["Shop Warehouse - GCC"],
    warehouses: ["Shop Warehouse - GCC"],
  });
  const lmj = col({ key: "lmj", label: "LMJ", companyLocationId: "loc_lmj", companyLocationName: "LMJ" });
  const inactiveShop = col({
    key: "cosmo_shop_x",
    label: "X Shop",
    active: false,
    warehouses: ["Shop Warehouse - X"],
  });

  it("keeps Cosmetics.lk + shops and drops other company ROP columns", () => {
    const selected = selectVatRopColumns([cosmetics, shop, lmj, inactiveShop]);
    expect(selected.map((c) => c.key)).toEqual(["cosmetics_lk", "cosmo_shop_gcc"]);
  });

  it("selectVatStockColumns mirrors location filter for stock", () => {
    expect(selectVatStockColumns([cosmetics, shop, lmj]).map((c) => c.key)).toEqual([
      "cosmetics_lk",
      "cosmo_shop_gcc",
    ]);
  });

  it("finds Cosmetics.lk column", () => {
    expect(findCosmeticsLkRopColumn([lmj, shop, cosmetics])?.key).toBe("cosmetics_lk");
  });
});

describe("totalRopForVat", () => {
  it("uses Cosmetics.lk ROP only (not shop sum)", () => {
    expect(
      totalRopForVat({ cosmetics_lk: 100, cosmo_shop_gcc: 10, cosmo_shop_pep: 20 }, "cosmetics_lk"),
    ).toBe(100);
  });

  it("returns 0 when Cosmetics.lk ROP missing even if shops filled", () => {
    expect(totalRopForVat({ cosmo_shop_gcc: 50 }, "cosmetics_lk")).toBe(0);
    expect(totalRopForVat({ cosmetics_lk: 100 }, null)).toBe(0);
  });
});

describe("totalRopForColumns", () => {
  it("sums all columns (Main behavior)", () => {
    expect(
      totalRopForColumns({ cosmetics_lk: 100, cosmo_shop_gcc: 10, lmj: 5 }, [
        { key: "cosmetics_lk" },
        { key: "cosmo_shop_gcc" },
        { key: "lmj" },
      ]),
    ).toBe(115);
  });
});
