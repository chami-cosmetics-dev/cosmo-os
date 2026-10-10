import { describe, expect, it } from "vitest";

import {
  attachSubjectRopPercent,
  buildBrandWarehouseViolations,
  buildCosmeticsStockReport,
  buildCosmeticsStockReportDetails,
  buildFocusedStockReport,
  buildFocusCompare,
  buildRopWatch,
  buildShopCompare,
  decorateReportRows,
  filterReportByMainRopPercent,
  classifyWarehouseKind,
  computeCriticalCutoff,
  isAtOrBelowRopPercent,
  matchesIdentityFilters,
  selectWatchedTargets,
  markCriticalTopSellers,
  type RopColumnRef,
  type RopWatchRow,
  type StockBalanceRow,
} from "@/lib/cosmetics-stock-comparer";
import { baseSku } from "@/lib/osf/base-sku";

function row(input: Partial<StockBalanceRow>): StockBalanceRow {
  return {
    Item: input.Item ?? "SKU-1",
    "Item Name": input["Item Name"] ?? "Product",
    Company: input.Company ?? "Cosmetics.lk",
    Warehouse: input.Warehouse ?? "Main Warehouse - Cosmo",
    "Balance Qty": input["Balance Qty"] ?? 0,
    "__ERP Source": input["__ERP Source"] ?? "",
  };
}

describe("classifyWarehouseKind", () => {
  it("classifies Cosmo main, shops, and other warehouses", () => {
    expect(classifyWarehouseKind("Main Warehouse - Cosmo")).toBe("main");
    expect(classifyWarehouseKind("Pepiliyana Shop Warehouse")).toBe("shop");
    expect(classifyWarehouseKind("Pepiliyana Main Warehouse")).toBe("online");
    expect(classifyWarehouseKind("Main Warehouse - SPK")).toBe("online");
    expect(classifyWarehouseKind("Website Inventory - Cosmo")).toBe("online");
    expect(classifyWarehouseKind("Stores - CCON")).toBe("online");
  });
});

describe("buildCosmeticsStockReport", () => {
  it("includes items where main warehouse stock is at or below threshold", () => {
    const report = buildCosmeticsStockReport(
      [
        row({ Item: "LOW", "Balance Qty": 0 }),
        row({ Item: "HIGH", "Balance Qty": 5 }),
      ],
      0,
    );

    expect(report.map((r) => r.SKU)).toEqual(["LOW"]);
  });

  it("ignores all warehouses rows and uses shop warehouse over main warehouse", () => {
    const report = buildCosmeticsStockReport([
      row({ Item: "SKU-1", "Balance Qty": 0 }),
      row({
        Item: "SKU-1",
        Company: "Pepiliyana",
        Warehouse: "All Warehouses - LMJ",
        "Balance Qty": 99,
      }),
      row({
        Item: "SKU-1",
        Company: "LMJ",
        Warehouse: "Pepiliyana Main Warehouse",
        "Balance Qty": 3,
      }),
      row({
        Item: "SKU-1",
        Company: "LMJ",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 7,
      }),
    ]);

    expect(report).toMatchObject([
      {
        SKU: "SKU-1",
        "Online Warehouse(s)": "Pepiliyana",
        "Online Qty": 3,
        "Shop Warehouse(s)": "Pepiliyana",
        "Shop Qty": 7,
        "Stock Available Elsewhere": "Yes",
      },
    ]);
  });

  it("lists other main warehouses in online and shop floors in shops", () => {
    const details = buildCosmeticsStockReportDetails([
      row({ Item: "SKU-1", "Balance Qty": 0 }),
      row({
        Item: "SKU-1",
        Warehouse: "Main Warehouse - SPK",
        "Balance Qty": 8,
      }),
      row({
        Item: "SKU-1",
        Company: "LMJ",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 3,
      }),
    ]);

    expect(details[0]?.online).toMatchObject([{ name: "SPK", qty: 8, kind: "online" }]);
    expect(details[0]?.shops).toMatchObject([{ name: "Pepiliyana", qty: 3, kind: "shop" }]);
  });

  it("lists website / non-shop stock with shops", () => {
    const details = buildCosmeticsStockReportDetails([
      row({ Item: "SKU-1", "Balance Qty": 0 }),
      row({
        Item: "SKU-1",
        Warehouse: "Website Inventory - Cosmo",
        "Balance Qty": 8,
      }),
      row({
        Item: "SKU-1",
        Company: "LMJ",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 3,
      }),
    ]);

    expect(details[0]?.online.map((loc) => loc.warehouse)).toEqual(["Website Inventory - Cosmo"]);
    expect(details[0]?.shops.map((loc) => loc.name)).toEqual(["Pepiliyana"]);
    expect(details[0]?.["Online Qty"]).toBe(8);
    expect(details[0]?.["Shop Qty"]).toBe(3);
  });

  it("sorts rows with available stock first and then by SKU", () => {
    const report = buildCosmeticsStockReport([
      row({ Item: "B", "Balance Qty": 0 }),
      row({ Item: "A", "Balance Qty": 0 }),
      row({ Item: "B", Company: "Cool Planet", Warehouse: "Cool Planet Shop Warehouse", "Balance Qty": 2 }),
    ]);

    expect(report.map((r) => r.SKU)).toEqual(["B", "A"]);
  });

  it("groups outlet rows by warehouse-derived outlet when company is the same", () => {
    const report = buildCosmeticsStockReport(
      [
        row({ Item: "ACN01_1", "Item Name": "Acnes Sealing Gel Pimple Treatment 9g", "Balance Qty": 2 }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "Cool Planet Nugegoda Shop Warehouse",
          "Balance Qty": 2,
        }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "GCC Shop Warehouse",
          "Balance Qty": 0,
        }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "Kiribathgoda Shop Warehouse",
          "Balance Qty": 2,
        }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "Maharagama Shop Warehouse",
          "Balance Qty": 1,
        }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "OGF Shop Warehouse",
          "Balance Qty": 0,
        }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "Pepiliyana Shop Warehouse",
          "Balance Qty": 4,
        }),
      ],
      2,
    );

    expect(report).toMatchObject([
      {
        SKU: "ACN01_1",
        "Shop Warehouse(s)": "Cool Planet, Kiribathgoda, Maharagama, Pepiliyana",
        "Shop Qty": 9,
        "Stock Available Elsewhere": "Yes",
      },
    ]);
  });

  it("uses selected warehouse tokens for shop name over company display", () => {
    const report = buildCosmeticsStockReport([
      row({ Item: "SKU-1", "Balance Qty": 0 }),
      row({
        Item: "SKU-1",
        Company: "Chami Trading",
        Warehouse: "Shop Warehouse - SPK",
        "Balance Qty": 7,
      }),
    ]);

    expect(report).toMatchObject([
      {
        SKU: "SKU-1",
        "Shop Warehouse(s)": "SPK",
        "Shop Qty": 7,
      },
    ]);
  });

  it("reports ERP1-only brands found in ERP2 stock", () => {
    const violations = buildBrandWarehouseViolations([
      row({
        Item: "ACNES-1",
        "Item Name": "Acnes Creamy Wash",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 3,
        "__ERP Source": "ERP1",
      }),
      row({
        Item: "ACNES-1",
        "Item Name": "Acnes Creamy Wash",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 2,
        "__ERP Source": "ERP2",
      }),
      row({
        Item: "ACNES-1",
        "Item Name": "Acnes Creamy Wash",
        Warehouse: "All Warehouses - Cosmo",
        "Balance Qty": 10,
        "__ERP Source": "ERP2",
      }),
      row({
        Item: "HL-1",
        "Item Name": "Hada Labo Lotion",
        Warehouse: "Cool Planet Shop Warehouse",
        "Balance Qty": 1,
        "__ERP Source": "ERP2",
      }),
    ]);

    expect(violations).toEqual([
      {
        SKU: "ACNES-1",
        "Product Title": "Acnes Creamy Wash",
        Brand: "Acnes",
        "ERP Source": "ERP2",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 2,
        Rule: "Brand should only appear in ERP1",
      },
      {
        SKU: "HL-1",
        "Product Title": "Hada Labo Lotion",
        Brand: "Hada Labo",
        "ERP Source": "ERP2",
        Warehouse: "Cool Planet Shop Warehouse",
        "Balance Qty": 1,
        Rule: "Brand should only appear in ERP1",
      },
    ]);
  });

  it("reports ERP2-only brands found in ERP1 stock", () => {
    const violations = buildBrandWarehouseViolations([
      row({
        Item: "REV-1",
        "Item Name": "Revlon Lipstick",
        Warehouse: "Main Warehouse - Cosmo",
        "Balance Qty": 4,
        "__ERP Source": "ERP1",
      }),
      row({
        Item: "REV-1",
        "Item Name": "Revlon Lipstick",
        Warehouse: "Cool Planet Shop Warehouse",
        "Balance Qty": 8,
        "__ERP Source": "ERP2",
      }),
      row({
        Item: "MAY-1",
        "Item Name": "Maybeline Mascara",
        Warehouse: "Main Warehouse - Cosmo",
        "Balance Qty": 0,
        "__ERP Source": "ERP1",
      }),
    ]);

    expect(violations).toEqual([
      {
        SKU: "REV-1",
        "Product Title": "Revlon Lipstick",
        Brand: "Revlon",
        "ERP Source": "ERP1",
        Warehouse: "Main Warehouse - Cosmo",
        "Balance Qty": 4,
        Rule: "Brand should only appear in ERP2",
      },
    ]);
  });
});

describe("computeCriticalCutoff / markCriticalTopSellers", () => {
  it("uses the 20th-percentile-from-top units and includes ties", () => {
    expect(computeCriticalCutoff([100, 80, 50, 20, 10])).toBe(100);
    expect(computeCriticalCutoff([100, 90, 80, 70, 60, 50, 40, 30, 20, 10])).toBe(90);
    expect(computeCriticalCutoff([10, 10, 1])).toBe(10);
    expect(computeCriticalCutoff([0, 0])).toBeNull();
  });

  it("marks top sellers Critical and never marks zero-sale SKUs", () => {
    const details = buildCosmeticsStockReportDetails([
      row({ Item: "FAST", "Balance Qty": 2 }),
      row({ Item: "SLOW", "Balance Qty": 2 }),
      row({ Item: "DEAD", "Balance Qty": 0 }),
    ], 3);

    const sales = new Map<string, number>([
      ["OTHER-1", 100],
      ["FAST", 80],
      ["OTHER-2", 70],
      ["OTHER-3", 60],
      ["OTHER-4", 50],
      ["OTHER-5", 40],
      ["OTHER-6", 30],
      ["OTHER-7", 20],
      ["OTHER-8", 15],
      ["SLOW", 2],
    ]);

    const { rows, cutoff } = markCriticalTopSellers(details, sales, true);
    expect(cutoff).toBe(80);
    expect(rows.find((r) => r.SKU === "FAST")?.critical).toBe(true);
    expect(rows.find((r) => r.SKU === "SLOW")?.critical).toBe(false);
    expect(rows.find((r) => r.SKU === "DEAD")?.critical).toBe(false);
    expect(rows[0]?.SKU).toBe("FAST");
  });

  it("clears Critical when sales ranking is unavailable", () => {
    const details = buildCosmeticsStockReportDetails([
      row({ Item: "FAST", "Balance Qty": 0 }),
    ]);
    const { rows, cutoff } = markCriticalTopSellers(details, new Map([["FAST", 99]]), false);
    expect(cutoff).toBeNull();
    expect(rows[0]?.critical).toBe(false);
    expect(rows[0]?.sales90d).toBe(0);
  });
});

const watchColumns: RopColumnRef[] = [
  {
    key: "cosmetics_lk",
    label: "Cosmetics.lk",
    warehouses: ["Main Warehouse - Cosmo"],
    erpSource: "ERP1",
    active: true,
    includeInRop: true,
  },
  {
    key: "trading_a",
    label: "Trading A",
    warehouses: ["Main Warehouse - Trading A"],
    erpSource: "ERP2",
    active: true,
    includeInRop: true,
  },
  {
    key: "trading_shop",
    label: "Cool Planet Shop",
    warehouses: ["Cool Planet Shop Warehouse"],
    erpSource: "ERP2",
    active: true,
    includeInRop: true,
  },
];

describe("reorder percent watch", () => {
  it("includes 30% and excludes 31% of reorder point 100", () => {
    expect(isAtOrBelowRopPercent(30, 100, 30)).toBe(true);
    expect(isAtOrBelowRopPercent(31, 100, 30)).toBe(false);
  });

  it("does not hit a missing or zero reorder point and does hit negative stock", () => {
    expect(isAtOrBelowRopPercent(0, 0, 30)).toBe(false);
    expect(isAtOrBelowRopPercent(0, null, 30)).toBe(false);
    expect(isAtOrBelowRopPercent(-1, 100, 30)).toBe(true);
  });

  it("watches Cosmetics main and non-shop ERP2 warehouses only", () => {
    expect(selectWatchedTargets(watchColumns).map((target) => target.warehouse)).toEqual([
      "Main Warehouse - Cosmo",
      "Main Warehouse - Trading A",
    ]);
  });

  it("marks cosmetics.lk out of stock when main qty is 0", () => {
    const report = buildRopWatch({
      columns: watchColumns,
      stockRows: [
        row({ Item: "CAN07_1", "Balance Qty": 0 }),
        row({
          Item: "CAN07_1",
          Warehouse: "Main Warehouse - Trading A",
          "Balance Qty": 80,
          "__ERP Source": "ERP2",
        }),
      ],
      ropBySkuColumn: new Map([["can07_1::cosmetics_lk", 100]]),
      identities: [
        {
          sku: "CAN07_1",
          productTitle: "Sample",
          erp1ProductPriority: "Top Priority",
          erp2ProductPriority: null,
          vatStatus: "Vat",
        },
      ],
      percent: 30,
    });
    const hit = report.rows[0]?.hits.find((item) => item.role === "cosmetics-main");
    expect(hit?.hit).toBe(true);
    expect(hit?.websiteOutOfStock).toBe(true);
    expect(report.rows[0]?.commonSku).toBe("CAN07");
  });
});

describe("buildShopCompare", () => {
  it("includes threshold SKUs and main percent hits, shops only", () => {
    const stock = [
      row({ Item: "LOW", "Balance Qty": 0 }),
      row({
        Item: "LOW",
        Company: "LMJ",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 12,
      }),
      row({
        Item: "LOW",
        Warehouse: "Main Warehouse - Trading A",
        "Balance Qty": 9,
        "__ERP Source": "ERP2",
      }),
      row({ Item: "HEALTHY", "Balance Qty": 20 }),
      row({
        Item: "HEALTHY",
        Company: "LMJ",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 4,
      }),
    ];
    const ropWatch: RopWatchRow[] = [
      {
        SKU: "HEALTHY",
        commonSku: "HEALTHY",
        "Product Title": "Healthy",
        erp1ProductPriority: null,
        erp2ProductPriority: null,
        vatStatus: "",
        hits: [
          {
            columnKey: "cosmetics_lk",
            label: "Cosmetics.lk",
            warehouse: "Main Warehouse - Cosmo",
            erpSource: "ERP1",
            role: "cosmetics-main",
            qty: 20,
            rop: 100,
            percentOfRop: 0.2,
            hit: true,
            ropMissing: false,
            websiteOutOfStock: false,
          },
        ],
        context: [],
        elsewhere: [],
      },
    ];
    const shops = buildShopCompare({ stockRows: stock, threshold: 0, ropWatch, identities: [] });
    const low = shops.find((item) => item.SKU === "LOW");
    const healthy = shops.find((item) => item.SKU === "HEALTHY");
    expect(low?.mainQty).toBe(0);
    expect(low?.shops.map((shop) => shop.name)).toEqual(["Pepiliyana"]);
    expect(low?.shops.some((shop) => shop.warehouse === "Main Warehouse - Trading A")).toBe(false);
    expect(healthy?.mainQty).toBe(20);
    expect(healthy?.shops).toHaveLength(1);
  });
});

describe("buildFocusCompare", () => {
  it("omits the focus warehouse from elsewhere and skips a missing reorder point", () => {
    const rows = buildFocusCompare({
      columns: watchColumns,
      focusWarehouse: "Main Warehouse - Trading A",
      percent: 30,
      identities: [
        { sku: "HIT", productTitle: "Hit", erp1ProductPriority: null, erp2ProductPriority: null, vatStatus: "" },
        { sku: "NOROP", productTitle: "No rop", erp1ProductPriority: null, erp2ProductPriority: null, vatStatus: "" },
      ],
      ropBySkuColumn: new Map([["hit::trading_a", 100]]),
      stockRows: [
        row({ Item: "HIT", Warehouse: "Main Warehouse - Trading A", "Balance Qty": 4, "__ERP Source": "ERP2" }),
        row({ Item: "HIT", Warehouse: "Website Inventory - Cosmo", "Balance Qty": 20 }),
        row({ Item: "HIT", Warehouse: "All Warehouses - Cosmo", "Balance Qty": 99 }),
        row({ Item: "NOROP", Warehouse: "Main Warehouse - Trading A", "Balance Qty": 1, "__ERP Source": "ERP2" }),
      ],
    });
    expect(rows.map((item) => item.SKU)).toEqual(["HIT"]);
    expect(rows[0]?.elsewhere.map((location) => location.warehouse)).toEqual(["Website Inventory - Cosmo"]);
    expect(rows[0]?.elsewhere.some((location) => location.warehouse === "Main Warehouse - Trading A")).toBe(false);
  });
});

describe("buildFocusedStockReport", () => {
  it("uses the chosen warehouse as the subject and keeps it out of the other columns", () => {
    const report = buildFocusedStockReport(
      [
        row({ Item: "SKU-1", Warehouse: "Main Warehouse - Cosmo", "Balance Qty": 8 }),
        row({ Item: "SKU-1", Warehouse: "Pepiliyana Shop Warehouse", Company: "LMJ", "Balance Qty": 0 }),
        row({ Item: "SKU-1", Warehouse: "Main Warehouse - Trading A", "Balance Qty": 0, "__ERP Source": "ERP2" }),
        row({ Item: "HIGH", Warehouse: "Main Warehouse - Trading A", "Balance Qty": 9, "__ERP Source": "ERP2" }),
      ],
      "Main Warehouse - Trading A",
      0,
    );
    expect(report.map((item) => item.SKU)).toEqual(["SKU-1"]);
    expect(report[0]?.["Main Warehouse Qty"]).toBe(0);
    expect(report[0]?.cosmeticsMainQty).toBe(8);
    expect(report[0]?.online.some((item) => item.warehouse === "Main Warehouse - Cosmo")).toBe(false);
    expect(report[0]?.online.some((item) => item.warehouse === "Main Warehouse - Trading A")).toBe(false);
    expect(report[0]?.shops).toEqual([]);
  });
});

describe("partition outlet main and shop", () => {
  it("shows an outlet main warehouse and its shop warehouse on separate columns", () => {
    const details = buildCosmeticsStockReportDetails([
      row({ Item: "SKU-1", "Balance Qty": 0 }),
      row({
        Item: "SKU-1",
        Company: "LMJ",
        Warehouse: "Pepiliyana Main Warehouse",
        "Balance Qty": 3,
      }),
      row({
        Item: "SKU-1",
        Company: "LMJ",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 0,
      }),
    ]);

    expect(details[0]?.online).toMatchObject([{ name: "Pepiliyana", qty: 3, kind: "online" }]);
    expect(details[0]?.shops).toMatchObject([{ name: "Pepiliyana", qty: 0, kind: "shop" }]);
  });
});

describe("attachSubjectRopPercent", () => {
  it("sets stock as a percent of the subject reorder point", () => {
    const details = buildCosmeticsStockReportDetails(
      [row({ Item: "LOW", "Balance Qty": 15 }), row({ Item: "NOROP", "Balance Qty": 0 })],
      100,
    );
    const attached = attachSubjectRopPercent(details, new Map([["low::cosmetics_lk", 100]]), "cosmetics_lk");
    const low = attached.find((item) => item.SKU === "LOW");
    const missing = attached.find((item) => item.SKU === "NOROP");
    expect(low?.rop).toBe(100);
    expect(low?.stockPctOfRop).toBe(15);
    expect(missing?.rop).toBeNull();
    expect(missing?.stockPctOfRop).toBeNull();
  });
});

describe("filterReportByMainRopPercent", () => {
  it("keeps main stock at or below the percent of the Cosmetics main reorder point", () => {
    const details = buildCosmeticsStockReportDetails(
      [
        row({ Item: "LOW", "Balance Qty": 30 }),
        row({ Item: "HIGH", "Balance Qty": 31 }),
        row({ Item: "NOROP", "Balance Qty": 0 }),
      ],
      100,
    );
    const kept = filterReportByMainRopPercent(
      details,
      new Map([
        ["low::cosmetics_lk", 100],
        ["high::cosmetics_lk", 100],
      ]),
      "cosmetics_lk",
      30,
    );
    expect(kept.map((item) => item.SKU)).toEqual(["LOW"]);
    const decorated = decorateReportRows(kept, [
      {
        sku: "LOW",
        productTitle: "Low item",
        erp1ProductPriority: "Top Priority",
        erp2ProductPriority: null,
        vatStatus: "Vat",
      },
    ]);
    expect(decorated[0]?.commonSku).toBe("LOW");
    expect(decorated[0]?.erp1ProductPriority).toBe("Top Priority");
    expect(decorated[0]?.vatStatus).toBe("Vat");
  });
});

describe("matchesIdentityFilters", () => {
  const can07 = {
    SKU: "CAN07_1",
    commonSku: baseSku("CAN07_1"),
    "Product Title": "One",
    erp1ProductPriority: "Top Priority",
    erp2ProductPriority: null,
    vatStatus: "Vat",
  };
  const sibling = {
    ...can07,
    SKU: "CAN07_2",
    commonSku: baseSku("CAN07_2"),
    erp1ProductPriority: null,
    erp2ProductPriority: "Priority",
    vatStatus: "Non Vat",
  };

  it("filters common SKU, variant SKU, either-company priority, and VAT together", () => {
    expect(matchesIdentityFilters(can07, { commonSku: "can07" })).toBe(true);
    expect(matchesIdentityFilters(sibling, { commonSku: "CAN07" })).toBe(true);
    expect(matchesIdentityFilters(can07, { variantSku: "CAN07_1" })).toBe(true);
    expect(matchesIdentityFilters(sibling, { variantSku: "CAN07_1" })).toBe(false);
    expect(matchesIdentityFilters(can07, { priority: "top priority" })).toBe(true);
    expect(matchesIdentityFilters(sibling, { priority: "top priority" })).toBe(false);
    expect(matchesIdentityFilters(sibling, { priority: "Priority" })).toBe(true);
    expect(matchesIdentityFilters(can07, { vatStatus: "Vat", priority: "Top Priority" })).toBe(true);
    expect(matchesIdentityFilters(can07, { vatStatus: "Non Vat", priority: "Top Priority" })).toBe(false);
    expect(matchesIdentityFilters({ ...can07, erp1ProductPriority: null, vatStatus: "" }, { priority: "Top Priority" })).toBe(false);
    expect(matchesIdentityFilters({ ...can07, vatStatus: "" }, { vatStatus: "Vat" })).toBe(false);
  });
});
