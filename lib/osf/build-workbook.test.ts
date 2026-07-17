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
  it("emits identity and pricing headers and Common SKU aggregation", () => {
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
    expect(first["Common SKU Stock"]).toBe(5);
    expect(first["Common ROP"]).toBe(15);
    expect(first["OGF Price"]).toBe(90);
    expect(first["Sales Units (2026-06)"]).toBe(7);
    expect(first["Shop Availability"]).toBe("Allowed");
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

  it("writes a 3-row header band (totals / sections / headers) on Main", () => {
    const wb = parse(buildOsfWorkbookBuffer({ ...baseInput }));
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Main"]!, {
      header: 1,
      defval: "",
    });
    const [totals, sections, headers] = aoa as (string | number)[][];
    // Header row carries the real column names
    expect(headers).toContain("LMJ");
    expect(headers).toContain("Total Stock");
    // Section row carries the date banner + section labels
    expect(sections).toContain("18.06.2026");
    expect(sections).toContain("ROP");
    // Totals row sums the stock column (2 + 3)
    const lmjIdx = headers.indexOf("LMJ");
    expect(totals[lmjIdx]).toBe(5);
  });

  it("adds a per-buyer sheet filtered by brand and without pricing columns", () => {
    const wb = parse(
      buildOsfWorkbookBuffer({
        ...baseInput,
        buyers: [{ name: "Randil", brands: ["BrandA"] }],
      }),
    );
    expect(wb.SheetNames).toContain("Randil");
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Randil"]!, {
      header: 1,
      defval: "",
    });
    const headers = aoa[2] as string[];
    // Pricing columns are excluded from buyer sheets
    expect(headers).not.toContain("Latest Cost");
    expect(headers).not.toContain("Cosmetics MRP");
    // Only BrandA rows remain (CAN07_1), not BrandB (MAU01_1)
    const dataRows = aoa.slice(3);
    const skuIdx = headers.indexOf("Variant SKU");
    const skus = dataRows.map((r) => r[skuIdx]);
    expect(skus).toContain("CAN07_1");
    expect(skus).not.toContain("MAU01_1");
  });

  it("includes the full catalog when a buyer has no brands", () => {
    const wb = parse(
      buildOsfWorkbookBuffer({
        ...baseInput,
        buyers: [{ name: "All", brands: [] }],
      }),
    );
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["All"]!, {
      header: 1,
      defval: "",
    });
    expect(aoa.slice(3)).toHaveLength(2);
  });
});
