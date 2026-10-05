import { describe, expect, it } from "vitest";

import { isShopWarehouseName } from "@/lib/item-trends/physical-shops";
import {
  cosmoShopKeyFromWarehouse,
  cosmoShopLabelFromWarehouse,
} from "@/lib/osf/shop-column-key";

describe("cosmoShopKeyFromWarehouse / label", () => {
  it("maps GCC shop warehouse to stable key and label", () => {
    expect(cosmoShopKeyFromWarehouse("GCC Shop Warehouse - Cosmo")).toBe("cosmo_shop_gcc");
    expect(cosmoShopLabelFromWarehouse("GCC Shop Warehouse - Cosmo")).toBe("GCC Shop");
  });

  it("handles Pepiliyana style names", () => {
    expect(cosmoShopKeyFromWarehouse("Pepiliyana Shop Warehouse - Cosmo")).toBe(
      "cosmo_shop_pepiliyana",
    );
  });

  it("handles Negombo shop warehouse", () => {
    expect(cosmoShopKeyFromWarehouse("Negombo Shop Warehouse - Cosmo")).toBe(
      "cosmo_shop_negombo",
    );
    expect(cosmoShopLabelFromWarehouse("Negombo Shop Warehouse - Cosmo")).toBe("Negombo Shop");
  });
});

describe("shop warehouse qualification (reuse isShopWarehouseName)", () => {
  it("accepts shop floors and rejects website / transit", () => {
    expect(isShopWarehouseName("GCC Shop Warehouse - Cosmo")).toBe(true);
    expect(isShopWarehouseName("Cosmetics.lk Website")).toBe(false);
    expect(isShopWarehouseName("Goods In Transit")).toBe(false);
    expect(isShopWarehouseName("All Warehouses - Cosmo")).toBe(false);
  });
});
