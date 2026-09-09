import { describe, expect, it } from "vitest";

import { isVaultStockItem, mapErpItemToCatalogRow } from "@/lib/vault-osf/catalog";

describe("vault OSF catalog filters", () => {
  it("keeps enabled stock items", () => {
    const row = mapErpItemToCatalogRow({
      name: "NW004-2",
      item_code: "NW004-2",
      item_name: "Now Vitamin C",
      brand: "Now",
      item_group: "Vitamins",
      country_of_origin: "USA",
      disabled: 0,
      is_stock_item: 1,
    });
    expect(row?.sku).toBe("NW004-2");
    expect(row?.category).toBe("Vitamins");
  });

  it("drops delivery charges, TEST, disabled, and non-stock", () => {
    expect(isVaultStockItem({ item_code: "DELIVERY-CHARGES", disabled: 0, is_stock_item: 1 })).toBe(
      false,
    );
    expect(isVaultStockItem({ item_code: "TEST", disabled: 0, is_stock_item: 1 })).toBe(false);
    expect(isVaultStockItem({ item_code: "NW004-2", disabled: 1, is_stock_item: 1 })).toBe(false);
    expect(isVaultStockItem({ item_code: "NW004-2", disabled: 0, is_stock_item: 0 })).toBe(false);
  });
});
