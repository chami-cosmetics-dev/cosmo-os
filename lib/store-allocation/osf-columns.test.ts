import { describe, expect, it } from "vitest";

import { filterStoreAllocationColumns, isShopOsfColumn } from "@/lib/store-allocation/osf-columns";
import type { OsfResolvedColumn } from "@/lib/osf/column-config";

function col(partial: Partial<OsfResolvedColumn> & { key: string; label: string }): OsfResolvedColumn {
  return {
    id: partial.id ?? `col-${partial.key}`,
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

describe("isShopOsfColumn", () => {
  it("detects cosmo_shop_ keys and Shop labels", () => {
    expect(isShopOsfColumn({ key: "cosmo_shop_gcc", label: "GCC Shop" })).toBe(true);
    expect(isShopOsfColumn({ key: "lmj", label: "LMJ" })).toBe(false);
    expect(isShopOsfColumn({ key: "cosmetics_lk", label: "Cosmetics.lk" })).toBe(false);
  });
});

describe("filterStoreAllocationColumns", () => {
  it("keeps active ROP non-shop columns", () => {
    const out = filterStoreAllocationColumns([
      col({ key: "cosmo_shop_gcc", label: "GCC Shop" }),
      col({ key: "lmj", label: "LMJ" }),
      col({ key: "dro", label: "DRO", includeInRop: false }),
    ]);
    expect(out.map((c) => c.key)).toEqual(["lmj"]);
  });
});
