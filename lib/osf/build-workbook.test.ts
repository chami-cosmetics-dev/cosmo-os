import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import {
  buildMainSheetRows,
  buildOsfWorkbookBuffer,
  identityHeaders,
  mainColumnDescriptors,
  pricingHeaders,
  type BuildWorkbookInput,
} from "@/lib/osf/build-workbook";
import type { OsfCatalogRow } from "@/lib/osf/catalog-rows";
import type { OsfResolvedColumn } from "@/lib/osf/column-config";

const catalog: OsfCatalogRow[] = [
  {
    sku: "CAN07_1",
    productTitle: "Can Product 1",
    brand: "BrandA",
    barcode: "111",
    imageUrl: null,
    siteStatus: "active",
    itemStatusLabel: "Continue",
    itemStatusCategory: "CONTINUE",
    erp1ProductPriority: "Continue",
    erp2ProductPriority: "Continue",
    mrp: 100,
    discountedPrice: 80,
    vendorId: null,
  },
  {
    sku: "CAN07_2",
    productTitle: "Can Product 2",
    brand: "BrandA",
    barcode: "222",
    imageUrl: null,
    siteStatus: "active",
    itemStatusLabel: "Continue",
    itemStatusCategory: "CONTINUE",
    erp1ProductPriority: "Continue",
    erp2ProductPriority: "Continue",
    mrp: 100,
    discountedPrice: 80,
    vendorId: null,
  },
];

const columns: OsfResolvedColumn[] = [
  {
    id: "1",
    key: "lmj",
    label: "LMJ",
    companyLocationId: null,
    companyLocationName: null,
    erpnextInstanceId: null,
    directWarehouses: [],
    includeInStock: true,
    includeInRop: true,
    sortOrder: 1,
    active: true,
    warehouses: ["LMJ - WH"],
  },
];

describe("buildMainSheetRows", () => {
  it("emits identity and pricing headers without Common SKU columns", () => {
    const binMap = new Map<string, number>([
      ["LMJ - WH::CAN07_1", 2],
      ["LMJ - WH::CAN07_2", 3],
    ]);
    const profiles = new Map([
      ["CAN07_1", { shopAvailability: "allowed", ogfPrice: 90, rops: { lmj: 10 } }],
      ["CAN07_2", { shopAvailability: "allowed", ogfPrice: null, rops: { lmj: 5 } }],
    ]);

    const rows = buildMainSheetRows({
      catalog,
      columns,
      profiles,
      binMap,
      costMap: new Map([
        ["CAN07_1", { cost: 40, supplier: "SupA" }],
        ["CAN07_2", { cost: null, supplier: null }],
      ]),
      purchaseMap: new Map([
        [
          "CAN07_1",
          { supplier: "Acme Distributors", qty: 12, rate: null, date: "2026-07-06", recentQty: 18 },
        ],
      ]),
      monthlySales: new Map([["CAN07_1", 7]]),
      salesMonth: "2026-06",
      asOfDate: "2026-07-16",
    });

    expect(rows).toHaveLength(2);
    const first = rows[0]!;
    for (const h of identityHeaders()) {
      expect(first).toHaveProperty(h);
    }
    for (const h of pricingHeaders()) {
      expect(first).toHaveProperty(h);
    }
    expect(first).not.toHaveProperty("Common SKU Stock");
    expect(first).not.toHaveProperty("Common ROP");
    expect(first).not.toHaveProperty("Common SKU Reorder");
    expect(first).toHaveProperty("OGF Price");
    expect(first).toHaveProperty("% of ROP");
    expect(first).not.toHaveProperty("Variant SKU");
    expect(first).not.toHaveProperty("Variant SKU (-)");
    expect(first["Total Stock"]).toBe(2);
    expect(first["LMJ ROP"]).toBe(10);
    expect(first["Total ROP"]).toBe(10);
    expect(first["OGF Price"]).toBe(90);
    expect(first["Sales Units (2026-06)"]).toBe(7);
    expect(first["June 2026 Sales Total"]).toBe(7);
    expect(first["Max sale"]).toBe(7);
    expect(first.AVE).toBe(7);
    expect(first).toHaveProperty("April 2026 Sales Total");
    expect(first).toHaveProperty("April 2026 Purchase Qty");
    expect(first).toHaveProperty("April 2026 Purchase Total");
    expect(first["Shop Availability"]).toBe("Allowed");
    expect(first["VAT Status"]).toBe("Non-VAT");
    const vatOnly = buildMainSheetRows({
      catalog: [{ ...catalog[0]!, erp1ProductPriority: "Vat" }],
      columns,
      profiles: new Map(),
      binMap: new Map(),
      costMap: new Map(),
      purchaseMap: new Map(),
      monthlySales: new Map(),
      salesMonth: "2026-06",
      asOfDate: "2026-07-16",
    });
    expect(vatOnly[0]!["VAT Status"]).toBe("VAT");
    // OGF margin = (90-40)/90
    expect(first["OGF Margin %"]).toBeCloseTo(55.56, 1);
    // Purchasing data from ERP purchase receipts
    expect(first["Latest supplier"]).toBe("Acme Distributors");
    expect(first["Last Purchase Qty"]).toBe(12);
    expect(first["Last Purchase Date"]).toBe("2026-07-06");
    expect(first["Days Since Last Purchase"]).toBe(10);
    expect(first["Purchased (last 30d)"]).toBe(18);
    // Item without a purchase record stays blank
    const second = rows[1]!;
    expect(second["Last Purchase Qty"]).toBeNull();
    expect(second["Days Since Last Purchase"]).toBeNull();
    expect(second["Purchased (last 30d)"]).toBeNull();
  });

  it("fills April→as-of sales and purchase grid cells", () => {
    const rows = buildMainSheetRows({
      catalog: [catalog[0]!],
      columns,
      profiles: new Map(),
      binMap: new Map(),
      costMap: new Map(),
      purchaseMap: new Map(),
      monthlySales: new Map(),
      salesMonth: "2026-06",
      asOfDate: "2026-06-18",
      salesByMonth: new Map([["CAN07_1", { "2026-04": 3, "2026-06": 9 }]]),
      purchasesByMonth: new Map([
        ["CAN07_1", { "2026-05": { qty: 4, netValue: 1200 } }],
      ]),
    });
    const row = rows[0]!;
    expect(row["April 2026 Sales Total"]).toBe(3);
    expect(row["May 2026 Sales Total"]).toBeNull();
    expect(row["June 2026 Sales Total"]).toBe(9);
    expect(row["Sales Units (2026-06)"]).toBe(9);
    expect(row["April 2026 Purchase Qty"]).toBeNull();
    expect(row["May 2026 Purchase Qty"]).toBe(4);
    expect(row["May 2026 Purchase Total"]).toBe(1200);
    expect(row).not.toHaveProperty("July 2026 Sales Total");
    expect(row["Max sale"]).toBe(9);
    expect(row.AVE).toBe(6);
  });

  it("VAT OSF: Cosmetics.lk + shop ROP only; Total ROP = Cosmetics.lk (not shop sum)", () => {
    const vatCols: OsfResolvedColumn[] = [
      {
        id: "ck",
        key: "cosmetics_lk",
        label: "Cosmetics.lk",
        companyLocationId: "loc_ck",
        companyLocationName: "Cosmetics.lk",
        erpnextInstanceId: null,
        directWarehouses: [],
        includeInStock: true,
        includeInRop: true,
        sortOrder: 1,
        active: true,
        warehouses: ["Stores - Cosmetics.lk"],
      },
      {
        id: "gcc",
        key: "cosmo_shop_gcc",
        label: "GCC Shop",
        companyLocationId: null,
        companyLocationName: null,
        erpnextInstanceId: null,
        directWarehouses: ["Shop Warehouse - GCC"],
        includeInStock: true,
        includeInRop: true,
        sortOrder: 2,
        active: true,
        warehouses: ["Shop Warehouse - GCC"],
      },
      {
        id: "lmj",
        key: "lmj",
        label: "LMJ",
        companyLocationId: "loc_lmj",
        companyLocationName: "LMJ",
        erpnextInstanceId: null,
        directWarehouses: [],
        includeInStock: true,
        includeInRop: true,
        sortOrder: 3,
        active: true,
        warehouses: ["LMJ - WH"],
      },
    ];
    const rows = buildMainSheetRows({
      catalog: [catalog[0]!],
      columns: vatCols,
      profiles: new Map([
        [
          "CAN07_1",
          {
            shopAvailability: "allowed",
            ogfPrice: null,
            rops: { cosmetics_lk: 100, cosmo_shop_gcc: 40, lmj: 25 },
          },
        ],
      ]),
      binMap: new Map([
        ["Stores - Cosmetics.lk::CAN07_1", 10],
        ["Shop Warehouse - GCC::CAN07_1", 5],
        ["LMJ - WH::CAN07_1", 2],
      ]),
      costMap: new Map(),
      purchaseMap: new Map(),
      monthlySales: new Map(),
      salesMonth: "2026-06",
      asOfDate: "2026-07-16",
      osfVariant: "vat",
    });
    const first = rows[0]!;
    expect(first["Cosmetics.lk ROP"]).toBe(100);
    expect(first["GCC Shop ROP"]).toBe(40);
    expect(first["Total ROP"]).toBe(100);
    expect(first).not.toHaveProperty("LMJ ROP");
    expect(first).toHaveProperty("Cosmetics.lk");
    expect(first).toHaveProperty("GCC Shop");
    expect(first).not.toHaveProperty("LMJ");
    expect(first["Cosmetics MRP"]).toBeDefined();
    const mainRows = buildMainSheetRows({
      catalog: [catalog[0]!],
      columns: vatCols,
      profiles: new Map([
        [
          "CAN07_1",
          {
            shopAvailability: "allowed",
            ogfPrice: null,
            rops: { cosmetics_lk: 100, cosmo_shop_gcc: 40, lmj: 25 },
          },
        ],
      ]),
      binMap: new Map(),
      costMap: new Map(),
      purchaseMap: new Map(),
      monthlySales: new Map(),
      salesMonth: "2026-06",
      asOfDate: "2026-07-16",
      osfVariant: "main",
    });
    expect(mainRows[0]!["Total ROP"]).toBe(165);
    expect(mainRows[0]!).toHaveProperty("LMJ ROP");
  });

  it("uses signed warehouse order qty and positive-only TOTAL", () => {
    const multiCols: OsfResolvedColumn[] = [
      {
        id: "a",
        key: "wh_a",
        label: "WHA",
        companyLocationId: null,
        companyLocationName: null,
        erpnextInstanceId: null,
        directWarehouses: [],
        includeInStock: true,
        includeInRop: true,
        sortOrder: 1,
        active: true,
        warehouses: ["WH-A"],
      },
      {
        id: "b",
        key: "wh_b",
        label: "WHB",
        companyLocationId: null,
        companyLocationName: null,
        erpnextInstanceId: null,
        directWarehouses: [],
        includeInStock: true,
        includeInRop: true,
        sortOrder: 2,
        active: true,
        warehouses: ["WH-B"],
      },
      {
        id: "c",
        key: "wh_c",
        label: "WHC",
        companyLocationId: null,
        companyLocationName: null,
        erpnextInstanceId: null,
        directWarehouses: [],
        includeInStock: true,
        includeInRop: true,
        sortOrder: 3,
        active: true,
        warehouses: ["WH-C"],
      },
    ];
    const rows = buildMainSheetRows({
      catalog: [catalog[0]!],
      columns: multiCols,
      profiles: new Map([
        [
          "CAN07_1",
          {
            shopAvailability: null,
            ogfPrice: null,
            rops: { wh_a: 10, wh_b: 8, wh_c: 15 },
          },
        ],
      ]),
      binMap: new Map([
        ["WH-A::CAN07_1", 0],
        ["WH-B::CAN07_1", 5],
        ["WH-C::CAN07_1", 30],
      ]),
      costMap: new Map(),
      purchaseMap: new Map(),
      monthlySales: new Map(),
      salesMonth: "2026-06",
      asOfDate: "2026-07-16",
    });
    const row = rows[0]!;
    expect(row["WHA ORDER QTY"]).toBe(10);
    expect(row["WHB ORDER QTY"]).toBe(3);
    expect(row["WHC ORDER QTY"]).toBe(-15);
    expect(row["TOTAL ORDER QTY"]).toBe(0);
  });

  it("uses the purchase-receipt rate as Latest Cost when Item cost is missing", () => {
    const rows = buildMainSheetRows({
      catalog,
      columns,
      profiles: new Map(),
      binMap: new Map(),
      costMap: new Map([["CAN07_1", { cost: null, supplier: null }]]),
      purchaseMap: new Map([
        [
          "CAN07_1",
          { supplier: "Acme", qty: 5, rate: 60, date: "2026-07-06", recentQty: 5 },
        ],
      ]),
      monthlySales: new Map(),
      salesMonth: "2026-06",
      asOfDate: "2026-07-16",
    });
    const first = rows[0]!;
    expect(first["Latest Cost"]).toBe(60);
    // Cosmetics Margin = (100 - 60) / 100 = 40%
    expect(first["Cosmetics Margin %"]).toBeCloseTo(40, 1);
  });

  it("cosmetics margin uses original MRP not discounted price when both exist", () => {
    const rows = buildMainSheetRows({
      catalog: [{ ...catalog[0]!, mrp: 100, discountedPrice: 80 }],
      columns,
      profiles: new Map(),
      binMap: new Map(),
      costMap: new Map([["CAN07_1", { cost: 60, supplier: "SupA" }]]),
      purchaseMap: new Map(),
      monthlySales: new Map(),
      salesMonth: "2026-06",
      asOfDate: "2026-07-16",
    });
    const first = rows[0]!;
    expect(first["Cosmetics MRP"]).toBe(100);
    expect(first["Discounted Price"]).toBe(80);
    // (100 - 60) / 100 = 40%, not (80 - 60) / 80 = 25%
    expect(first["Cosmetics Margin %"]).toBeCloseTo(40, 1);
  });
});

const baseInput: Omit<BuildWorkbookInput, "buyers"> = {
  catalog: [
    { ...catalog[0]!, brand: "BrandA" },
    { ...catalog[1]!, sku: "MAU01_1", brand: "BrandB", productTitle: "Maui 1" },
  ],
  columns,
  profiles: new Map([
    ["CAN07_1", { shopAvailability: "allowed", ogfPrice: 90, rops: { lmj: 10 } }],
    ["MAU01_1", { shopAvailability: "allowed", ogfPrice: null, rops: { lmj: 5 } }],
  ]),
  binMap: new Map<string, number>([
    ["LMJ - WH::CAN07_1", 2],
    ["LMJ - WH::MAU01_1", 3],
  ]),
  costMap: new Map([["CAN07_1", { cost: 40, supplier: "SupA" }]]),
  purchaseMap: new Map(),
  monthlySales: new Map(),
  salesMonth: "2026-06",
  asOfDate: "2026-06-18",
};

describe("mainColumnDescriptors", () => {
  it("marks pricing columns and section/date banners", () => {
    const defs = mainColumnDescriptors({ ...baseInput });
    const bySection = defs.filter((d) => d.section).map((d) => d.section);
    // dd.mm.yyyy date banner on the first stock column
    expect(bySection).toContain("18.06.2026");
    expect(bySection).toContain("ROP");
    expect(bySection).toContain("REORDER Amount");
    expect(bySection).toContain("price");
    expect(bySection).toContain("Purchasing Cost");
    expect(bySection).toContain("Sales");
    expect(bySection).toContain("Purchases");
    expect(bySection).toContain("Derived");
    // Pricing columns are flagged (so they can be dropped from buyer sheets)
    const pricing = defs.filter((d) => d.pricing).map((d) => d.header);
    expect(pricing).toContain("Latest Cost");
    expect(pricing).toContain("Cosmetics MRP");
  });
});

describe("buildOsfWorkbookBuffer", () => {
  function parse(buf: Buffer) {
    return XLSX.read(buf, { type: "buffer" });
  }

  it(
    "writes a 2-row header band (sections / headers) on Main — no totals row",
    async () => {
      const wb = parse(await buildOsfWorkbookBuffer({ ...baseInput }));
      const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Main"]!, {
        header: 1,
        defval: "",
      });
      const [sections, headers] = aoa as (string | number)[][];
      // Header row carries the real column names
      expect(headers).toContain("LMJ");
      expect(headers).toContain("Total Stock");
      expect(headers).toContain("Total ROP");
      expect(headers).toContain("April 2026 Sales Total");
      expect(headers).toContain("April 2026 Purchase Qty");
      expect(headers).toContain("June 2026 Purchase Total");
      expect(headers).toContain("Max sale");
      expect(headers).toContain("AVE");
      expect(headers).not.toContain("Common SKU Stock");
      expect(headers).not.toContain("Common ROP");
      expect(headers).not.toContain("Common SKU Reorder");
      // Section row carries the date banner + section labels
      expect(sections).toContain("18.06.2026");
      expect(sections).toContain("ROP");
      // Data starts immediately after headers (row index 2)
      const skuIdx = headers.indexOf("Variant SKU (_)");
      expect(aoa[2]![skuIdx]).toBe("CAN07_1");
    },
    20_000,
  );

  it("filters Main columns when effectiveColumnKeys is empty (identity only)", async () => {
    const wb = parse(
      await buildOsfWorkbookBuffer({
        ...baseInput,
        effectiveColumnKeys: new Set(),
      }),
    );
    const headers = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Main"]!, {
      header: 1,
      defval: "",
    })[1] as string[];
    expect(headers).toContain("Variant SKU (_)");
    expect(headers).not.toContain("LMJ");
    expect(headers).not.toContain("Cosmetics MRP");
    expect(headers).not.toContain("Latest Cost");
    expect(headers).not.toContain("Cosmetics Margin %");
    expect(headers).not.toContain("April 2026 Sales Total");
    expect(headers).not.toContain("April 2026 Purchase Qty");
    expect(headers).not.toContain("Max sale");
    expect(headers).not.toContain("AVE");
  });

  it("includes marked keys and omits unmarked on Main", async () => {
    const wb = parse(
      await buildOsfWorkbookBuffer({
        ...baseInput,
        effectiveColumnKeys: new Set(["Cosmetics MRP", "Latest Cost", "Cosmetics Margin %"]),
      }),
    );
    const headers = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Main"]!, {
      header: 1,
      defval: "",
    })[1] as string[];
    expect(headers).toContain("Cosmetics MRP");
    expect(headers).toContain("Latest Cost");
    expect(headers).toContain("Cosmetics Margin %");
    expect(headers).not.toContain("OGF Margin %");
    expect(headers).not.toContain("LMJ");
  });

  it("includes all columns when effectiveColumnKeys is all", async () => {
    const wb = parse(
      await buildOsfWorkbookBuffer({
        ...baseInput,
        effectiveColumnKeys: "all",
      }),
    );
    const headers = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Main"]!, {
      header: 1,
      defval: "",
    })[1] as string[];
    expect(headers).toContain("Cosmetics MRP");
    expect(headers).toContain("Latest Cost");
    expect(headers).toContain("Cosmetics Margin %");
    expect(headers).toContain("OGF Margin %");
    expect(headers).toContain("LMJ");
    expect(headers).toContain("April 2026 Sales Total");
    expect(headers).toContain("April 2026 Purchase Qty");
    expect(headers).toContain("Max sale");
    expect(headers).toContain("AVE");
  });

  it("adds a per-buyer sheet filtered by brand and without pricing columns", async () => {
    const wb = parse(
      await buildOsfWorkbookBuffer({
        ...baseInput,
        buyers: [{ name: "Randil", brands: ["BrandA"] }],
      }),
    );
    expect(wb.SheetNames).toContain("Randil");
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Randil"]!, {
      header: 1,
      defval: "",
    });
    const headers = aoa[1] as string[];
    // Pricing columns are excluded from buyer sheets
    expect(headers).not.toContain("Latest Cost");
    expect(headers).not.toContain("Cosmetics MRP");
    expect(headers).not.toContain("Cosmetics Margin %");
    expect(headers).not.toContain("OGF Margin %");
    expect(headers).not.toContain("April 2026 Sales Total");
    expect(headers).not.toContain("April 2026 Purchase Qty");
    expect(headers).not.toContain("Max sale");
    expect(headers).not.toContain("AVE");
    // Only BrandA rows remain (CAN07_1), not BrandB (MAU01_1)
    const dataRows = aoa.slice(2);
    const skuIdx = headers.indexOf("Variant SKU (_)");
    const skus = dataRows.map((r) => r[skuIdx]);
    expect(skus).toContain("CAN07_1");
    expect(skus).not.toContain("MAU01_1");
  });

  it("buyer sheets never include pricing or margin columns", async () => {
    const wb = parse(
      await buildOsfWorkbookBuffer({
        ...baseInput,
        effectiveColumnKeys: new Set([
          "Cosmetics Margin %",
          "OGF Margin %",
          "stock:lmj",
          "rop:lmj",
          "order:lmj",
          "Total Stock",
          "Total ROP",
          "% of ROP",
          "70% OF TOTAL ROP",
          "70% OF TOTAL ROP AVAILABILITY",
          "TOTAL ORDER QTY",
        ]),
        buyers: [
          { name: "Inoka", brands: [] },
          { name: "Randil", brands: [] },
        ],
      }),
    );
    const mainHeaders = (
      XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Main"]!, {
        header: 1,
        defval: "",
      })[1] as string[]
    );
    expect(mainHeaders).toContain("Cosmetics Margin %");

    for (const name of ["Inoka", "Randil"] as const) {
      const headers = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[name]!, {
        header: 1,
        defval: "",
      })[1] as string[];
    expect(headers).not.toContain("Cosmetics Margin %");
    expect(headers).not.toContain("OGF Margin %");
    expect(headers).not.toContain("Latest Cost");
    expect(headers).not.toContain("April 2026 Sales Total");
    expect(headers).not.toContain("April 2026 Purchase Qty");
    expect(headers).not.toContain("Max sale");
    expect(headers).not.toContain("AVE");
    }
  });

  it("includes the full catalog when a buyer has no brands", async () => {
    const wb = parse(
      await buildOsfWorkbookBuffer({
        ...baseInput,
        buyers: [{ name: "All", brands: [] }],
      }),
    );
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["All"]!, {
      header: 1,
      defval: "",
    });
    expect(aoa.slice(2)).toHaveLength(2);
  });
});
