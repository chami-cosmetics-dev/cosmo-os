import { describe, expect, it } from "vitest";

import {
  buildVaultMainRows,
  COSMO_HEADERS_MUST_ABSENT,
  excelColumnLetter,
  vaultColumnDefs,
  vaultOsfSubtotalColumn,
  type VaultWorkbookInput,
} from "@/lib/vault-osf/build-workbook";
import type { VaultBusinessUnit } from "@/lib/vault-osf/types";

const units: VaultBusinessUnit[] = [
  {
    key: "sv",
    label: "SV",
    erpInstanceId: "e1",
    erpCompany: "SupplementVault.lk",
    warehouses: ["Main Warehouse - SV-1"],
    sortOrder: 10,
  },
  {
    key: "ori",
    label: "ORI",
    erpInstanceId: "e2",
    erpCompany: "Origins (PVT) LTD",
    warehouses: ["Main Warehouse - Origins"],
    sortOrder: 20,
  },
  {
    key: "ae",
    label: "AE",
    erpInstanceId: "e2",
    erpCompany: "AE (PVT) LTD",
    warehouses: ["Main Warehouse - AE"],
    sortOrder: 30,
  },
];

function input(over: Partial<VaultWorkbookInput> = {}): VaultWorkbookInput {
  return {
    catalog: [
      {
        sku: "NW004-2",
        variantSku: "NW004-2",
        barcode: "733739006851",
        itemName: "Now Vitamin C 1000mg 100 Tablets",
        brand: "Now",
        category: "Vitamins",
        country: "USA",
        countryClaimType: null,
        priorityStatus: "Top Priority brand & product",
      },
    ],
    units,
    asOfDate: "2026-09-07",
    binMap: new Map([
      ["Main Warehouse - SV-1::NW004-2", 6],
      ["Main Warehouse - Origins::NW004-2", 5],
      ["Main Warehouse - AE::NW004-2", 8],
    ]),
    sales: new Map([
      [
        "NW004-2",
        {
          "2026-06": {
            sv: { qty: 20, source: "erp" },
            ori: { qty: 5, source: "erp" },
            ae: { qty: 21, source: "erp" },
          },
        },
      ],
    ]),
    purchases: new Map(),
    prices: new Map([["NW004-2", { mrp: 9500, discountPercent: 10, discountedPrice: 8550 }]]),
    latest: new Map([["NW004-2", { rate: 5600, supplier: "Maiso Franceise", date: "2026-08-01" }]]),
    rops: new Map([["NW004-2", { sv: 9.152, ori: 19.448, ae: 28.6 }]]),
    ...over,
  };
}

describe("vault OSF workbook", () => {
  it("omits Cosmo-only and dropped sample columns", () => {
    const headers = vaultColumnDefs(units, "2026-09-07").map((d) => d.header);
    for (const h of COSMO_HEADERS_MUST_ABSENT) {
      expect(headers).not.toContain(h);
    }
    expect(headers).not.toContain("ERP1 Priority");
    expect(headers.filter((h) => h === "SV").length).toBeGreaterThan(1);
  });

  it("computes stock, max sale, AVE, signed reorder; blank ROP stays blank", () => {
    const rows = buildVaultMainRows(input());
    const row = rows[0]!;
    expect(row.variantSku).toBe("NW004-2");
    expect(row.sku).toBe("NW004");
    expect(row.stockTotal).toBe(19);
    expect(row["sales:2026-06:total"]).toBe(46);
    expect(row.maxSale).toBe(46);
    // Only June has sales → AVE = 46/1
    expect(row.ave).toBe(46);
    expect(row["reorder:sv"]).toBeCloseTo(3.152, 3);
    expect(row.mrp).toBe(9500);
    expect(row.discountedPrice).toBe(8550);

    const blankRop = buildVaultMainRows(input({ rops: new Map() }))[0]!;
    expect(blankRop["rop:sv"]).toBeNull();
    expect(blankRop["reorder:sv"]).toBeNull();
    expect(blankRop.ropTotal).toBeNull();
  });

  it("leaves April sales blank when no ERP/import cell", () => {
    const row = buildVaultMainRows(input())[0]!;
    expect(row["sales:2026-04:total"]).toBeNull();
    expect(row["purchQty:2026-06"]).toBeNull();
  });

  it("orders identity then ROP, stock, sales, purchases, pricing, derived, reorder, supplier", () => {
    const defs = vaultColumnDefs(units, "2026-09-07");
    const identity = defs.slice(0, 9).map((d) => d.key);
    expect(identity).toEqual([
      "variantSku",
      "sku",
      "brand",
      "itemName",
      "barcode",
      "category",
      "priorityStatus",
      "country",
      "countryClaimType",
    ]);
    expect(defs[0]!.header).toBe("Variant SKU");
    expect(defs[1]!.header).toBe("Common SKU");

    const keys = defs.map((d) => d.key);
    const idx = (k: string) => keys.indexOf(k);
    expect(idx("rop:sv")).toBeLessThan(idx("stock:sv"));
    expect(idx("stockTotal")).toBeLessThan(idx("sales:2026-04:total"));
    expect(idx("sales:2026-09:total")).toBeLessThan(idx("purchQty:2026-04"));
    expect(idx("purchValue:2026-09")).toBeLessThan(idx("mrp"));
    expect(idx("discountedPrice")).toBeLessThan(idx("maxSale"));
    expect(idx("ave")).toBeLessThan(idx("reorder:sv"));
    expect(idx("reorderTotal")).toBeLessThan(idx("latestPrice"));

    const firstPurch = idx("purchQty:2026-04");
    expect(defs[firstPurch]!.header).toBe("April 2026 Purchase Qty");
    expect(defs[firstPurch + 1]!.header).toBe("April 2026 Purchase Total");
    expect(defs[firstPurch]!.section).toBe("Purchases");
    expect(defs[firstPurch]!.band).toBe("purchase");
    expect(defs[idx("sales:2026-04:total")]!.section).toBe("Sales");
    expect(defs[idx("sales:2026-04:total")]!.band).toBe("sales");
  });

  it("marks numeric columns for SUBTOTAL and maps Excel letters", () => {
    expect(excelColumnLetter(1)).toBe("A");
    expect(excelColumnLetter(9)).toBe("I");
    expect(excelColumnLetter(27)).toBe("AA");
    expect(vaultOsfSubtotalColumn("rop:sv")).toBe(true);
    expect(vaultOsfSubtotalColumn("stockTotal")).toBe(true);
    expect(vaultOsfSubtotalColumn("sales:2026-06:total")).toBe(true);
    expect(vaultOsfSubtotalColumn("variantSku")).toBe(false);
    expect(vaultOsfSubtotalColumn("latestSupplier")).toBe(false);
  });
});
