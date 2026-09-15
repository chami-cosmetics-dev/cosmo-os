import { describe, expect, it } from "vitest";

import {
  buildVaultMainRows,
  COSMO_HEADERS_MUST_ABSENT,
  vaultColumnDefs,
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
    expect(row.stockTotal).toBe(19);
    expect(row["sales:2026-06:total"]).toBe(46);
    expect(row.maxSale).toBe(46);
    // Apr–Sep window = 6 months; only June has 46 → AVE = 46/6
    expect(row.ave).toBeCloseTo(46 / 6, 5);
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

  it("groups all sales columns then all purchase columns; no Variant SKU", () => {
    const defs = vaultColumnDefs(units, "2026-09-07");
    expect(defs.some((d) => d.key === "variantSku")).toBe(false);
    expect(defs[0]).toMatchObject({ key: "sku", header: "Common SKU" });

    const salesKeys = defs.filter((d) => d.key.startsWith("sales:")).map((d) => d.key);
    const purchKeys = defs.filter((d) => d.key.startsWith("purch")).map((d) => d.key);
    expect(salesKeys[0]).toBe("sales:2026-04:total");
    expect(salesKeys.at(-1)).toBe("sales:2026-09:total");
    expect(purchKeys[0]).toBe("purchValue:2026-04");
    expect(purchKeys[1]).toBe("purchQty:2026-04");

    const firstSales = defs.findIndex((d) => d.key === "sales:2026-04:total");
    const firstPurch = defs.findIndex((d) => d.key === "purchValue:2026-04");
    const lastSales = defs.findIndex((d) => d.key === "sales:2026-09:total");
    expect(firstSales).toBeLessThan(lastSales);
    expect(lastSales).toBeLessThan(firstPurch);
    expect(defs[firstSales]!.section).toBe("Sales");
    expect(defs[firstPurch]!.section).toBe("Purchases");
    expect(defs[firstSales]!.header).toBe("April 2026 Sales Total");
    expect(defs[firstPurch]!.header).toBe("April 2026 Purchase Total");
    expect(defs[firstPurch + 1]!.header).toBe("April 2026 Purchase Qty");

    for (const u of units) {
      expect(defs.some((d) => d.key === `sales:2026-06:${u.key}`)).toBe(false);
    }
    expect(defs.some((d) => d.key === "stock:sv")).toBe(true);
    expect(defs.some((d) => d.key === "rop:sv")).toBe(true);
    expect(defs.some((d) => d.key === "reorder:sv")).toBe(true);
  });
});
