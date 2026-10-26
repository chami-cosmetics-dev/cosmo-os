import { describe, expect, it } from "vitest";

import { readOrderAvailabilityConfig } from "@/lib/order-availability/config";
import {
  buildCompanyResults,
  buildDetail,
  capStatus,
  classifyLine,
  computeOrderValue,
  expandCommonSkuLines,
  isVariantSku,
  itemMatchesCommonSku,
  normalizeRequestLines,
  parseSkuPaste,
  pickOptions,
  rankCompanies,
} from "@/lib/order-availability/rank";
import type {
  CompanyResult,
  OrderAvailabilityResponse,
  SkuLine,
} from "@/lib/order-availability/types";

function skuLine(sku: string, qty = 1, extra: Partial<SkuLine> = {}): SkuLine {
  return {
    key: sku.toUpperCase(),
    sku,
    qty,
    itemCode: sku,
    itemName: null,
    unitPrice: 100,
    found: true,
    fromCommonSku: null,
    ...extra,
  };
}

function company(name: string, extra: Partial<CompanyResult> = {}): CompanyResult {
  return {
    company: name,
    warehouses: [`Main - ${name}`],
    lines: {},
    coveredCount: 0,
    shortCount: 0,
    missingCount: 0,
    totalAvailable: 0,
    fullCoverage: false,
    warehousePriority: null,
    capExempt: false,
    cap: null,
    option: null,
    ...extra,
  };
}

describe("parseSkuPaste", () => {
  it("reads one SKU per line", () => {
    expect(parseSkuPaste("A1\nB2\r\n\nC3")).toEqual([{ sku: "A1" }, { sku: "B2" }, { sku: "C3" }]);
  });

  it("reads a quantity after a comma, tab, or single space", () => {
    expect(parseSkuPaste("A1, 3\nB2\t4\nC3 5")).toEqual([
      { sku: "A1", qty: 3 },
      { sku: "B2", qty: 4 },
      { sku: "C3", qty: 5 },
    ]);
  });

  it("splits comma or space separated SKUs with no quantity", () => {
    expect(parseSkuPaste("A1, B2, C3\nD4 E5")).toEqual([
      { sku: "A1" },
      { sku: "B2" },
      { sku: "C3" },
      { sku: "D4" },
      { sku: "E5" },
    ]);
  });
});

describe("normalizeRequestLines", () => {
  it("merges duplicates case-insensitively, adds qty, keeps first spelling", () => {
    const result = normalizeRequestLines([{ sku: "abc1", qty: 2 }, { sku: " ABC1 " }, { sku: "x9" }]);
    expect(result).toEqual({
      ok: true,
      lines: [
        { key: "ABC1", sku: "abc1", qty: 3 },
        { key: "X9", sku: "x9", qty: 1 },
      ],
    });
  });

  it("drops blanks and rejects an empty list", () => {
    expect(normalizeRequestLines([{ sku: "  " }]).ok).toBe(false);
  });

  it("rejects more than 50 distinct SKUs", () => {
    const lines = Array.from({ length: 51 }, (_, i) => ({ sku: `S${i}` }));
    const result = normalizeRequestLines(lines);
    expect(result.ok).toBe(false);
    expect(normalizeRequestLines(lines.slice(0, 50)).ok).toBe(true);
  });
});

describe("isVariantSku / itemMatchesCommonSku", () => {
  it("treats trailing _N or -N as a variant", () => {
    expect(isVariantSku("ORD04_1")).toBe(true);
    expect(isVariantSku("ORD04-2")).toBe(true);
    expect(isVariantSku("ORD04")).toBe(false);
    expect(isVariantSku("ORD04_RED")).toBe(false);
  });

  it("matches the common SKU and its variants only", () => {
    expect(itemMatchesCommonSku("ORD04", "ord04")).toBe(true);
    expect(itemMatchesCommonSku("ORD04_1", "ORD04")).toBe(true);
    expect(itemMatchesCommonSku("ORD04-2", "ORD04")).toBe(true);
    expect(itemMatchesCommonSku("ORD040_1", "ORD04")).toBe(false);
    expect(itemMatchesCommonSku("ORD04_1", "ORD04_1")).toBe(true);
  });
});

describe("expandCommonSkuLines", () => {
  const items = [{ itemCode: "ORD04_1" }, { itemCode: "ORD04_2" }, { itemCode: "ORD040_1" }, { itemCode: "LAR78_1" }];

  it("expands a common SKU to every matching variant and copies qty", () => {
    expect(expandCommonSkuLines([{ key: "ORD04", sku: "ord04", qty: 2 }], items)).toEqual([
      { key: "ORD04_1", sku: "ORD04_1", qty: 2, fromCommonSku: "ord04" },
      { key: "ORD04_2", sku: "ORD04_2", qty: 2, fromCommonSku: "ord04" },
    ]);
  });

  it("keeps a typed variant exact", () => {
    expect(expandCommonSkuLines([{ key: "ORD04_1", sku: "ORD04_1", qty: 1 }], items)).toEqual([
      { key: "ORD04_1", sku: "ORD04_1", qty: 1, fromCommonSku: null },
    ]);
  });

  it("does not duplicate a variant already on the request", () => {
    expect(
      expandCommonSkuLines(
        [
          { key: "ORD04", sku: "ORD04", qty: 1 },
          { key: "ORD04_1", sku: "ORD04_1", qty: 3 },
        ],
        items,
      ),
    ).toEqual([
      { key: "ORD04_2", sku: "ORD04_2", qty: 1, fromCommonSku: "ORD04" },
      { key: "ORD04_1", sku: "ORD04_1", qty: 3, fromCommonSku: null },
    ]);
  });

  it("keeps an unmatched common SKU as a not-found line", () => {
    expect(expandCommonSkuLines([{ key: "NOPE", sku: "NOPE", qty: 1 }], items)).toEqual([
      { key: "NOPE", sku: "NOPE", qty: 1, fromCommonSku: null },
    ]);
  });

  it("includes the common SKU itself when it is an ERP item", () => {
    expect(
      expandCommonSkuLines([{ key: "ORD04", sku: "ORD04", qty: 1 }], [{ itemCode: "ORD04" }, { itemCode: "ORD04_1" }]),
    ).toEqual([
      { key: "ORD04", sku: "ORD04", qty: 1, fromCommonSku: null },
      { key: "ORD04_1", sku: "ORD04_1", qty: 1, fromCommonSku: "ORD04" },
    ]);
  });
});

describe("classifyLine", () => {
  it("classifies at the boundaries", () => {
    expect(classifyLine(4, 4)).toBe("covered");
    expect(classifyLine(3, 4)).toBe("short");
    expect(classifyLine(0, 4)).toBe("missing");
    expect(classifyLine(-2, 4)).toBe("missing");
  });
});

describe("buildCompanyResults + rankCompanies", () => {
  const lines = [skuLine("S1", 2), skuLine("S2"), skuLine("S3"), skuLine("NF", 1, { found: false, itemCode: null })];
  const warehousesByCompany = new Map([
    ["C1", ["Main - C1", "Main 2 - C1"]],
    ["C2", ["Main - C2"]],
  ]);
  const bins = new Map([
    ["Main - C1::S1", 1],
    ["Main 2 - C1::S1", 5],
    ["Main - C1::S2", 1],
    ["Main - C2::S1", 1],
    ["Main - C2::S3", 9],
  ]);

  it("sums warehouses per company, classifies, and ignores not-found SKUs", () => {
    const [c1, c2] = buildCompanyResults({ skuLines: lines, warehousesByCompany, binAvailable: bins });
    expect(c1.company).toBe("C1");
    expect(c1.lines.S1).toEqual({
      status: "covered",
      available: 6,
      byWarehouse: [
        { warehouse: "Main 2 - C1", available: 5, priority: null },
        { warehouse: "Main - C1", available: 1, priority: null },
      ],
    });
    expect(c1.lines.NF).toBeUndefined();
    expect([c1.coveredCount, c1.shortCount, c1.missingCount]).toEqual([2, 0, 1]);
    expect(c1.totalAvailable).toBe(3); // min(6,2) + min(1,1)
    expect(c2.lines.S1.status).toBe("short");
    expect([c2.coveredCount, c2.shortCount, c2.missingCount]).toEqual([1, 1, 1]);
  });

  it("ranks pinned warehouses first, then coverage; zero coverage stays last", () => {
    const ranked = rankCompanies([
      company("Top", { coveredCount: 5, totalAvailable: 9 }),
      company("P2", { coveredCount: 1, totalAvailable: 1, warehousePriority: 2, capExempt: true }),
      company("P1", { coveredCount: 1, totalAvailable: 1, warehousePriority: 1, capExempt: true }),
      company("EmptyP1", { coveredCount: 0, warehousePriority: 1, capExempt: true }),
    ]);
    expect(ranked.map((row) => row.company)).toEqual(["P1", "P2", "Top", "EmptyP1"]);
  });

  it("lists a pinned warehouse before a larger unpinned one", () => {
    const results = buildCompanyResults({
      skuLines: [skuLine("S1", 2)],
      warehousesByCompany,
      binAvailable: bins,
      warehousePriority: new Map([["Main - C1", 1]]),
    });
    expect(results.find((row) => row.company === "C1")?.lines.S1.byWarehouse).toEqual([
      { warehouse: "Main - C1", available: 1, priority: 1 },
      { warehouse: "Main 2 - C1", available: 5, priority: null },
    ]);
    expect(results.find((row) => row.company === "C1")?.warehousePriority).toBe(1);
    expect(results.find((row) => row.company === "C1")?.capExempt).toBe(true);
  });

  it("ranks by coverage, then capped quantity, then short count, then name", () => {
    const ranked = rankCompanies([
      company("Zeta", { coveredCount: 2, totalAvailable: 5 }),
      company("Beta", { coveredCount: 2, totalAvailable: 5, shortCount: 1 }),
      company("Alpha", { coveredCount: 2, totalAvailable: 5 }),
      company("Top", { coveredCount: 3, totalAvailable: 1 }),
      company("Qty", { coveredCount: 2, totalAvailable: 9 }),
    ]);
    expect(ranked.map((row) => row.company)).toEqual(["Top", "Qty", "Beta", "Alpha", "Zeta"]);
  });

  it("marks full coverage", () => {
    const results = buildCompanyResults({
      skuLines: [skuLine("S3")],
      warehousesByCompany,
      binAvailable: bins,
    });
    expect(results.find((row) => row.company === "C2")?.fullCoverage).toBe(true);
    expect(results.find((row) => row.company === "C1")?.fullCoverage).toBe(false);
  });
});

describe("computeOrderValue", () => {
  it("sums priced found lines and flags unpriced ones", () => {
    expect(
      computeOrderValue([
        skuLine("A", 2, { unitPrice: 150 }),
        skuLine("B", 1, { unitPrice: null }),
        skuLine("NF", 5, { found: false, unitPrice: 999 }),
      ]),
    ).toEqual({ value: 300, isLowerBound: true, unpricedSkus: ["B"] });
  });
});

describe("capStatus", () => {
  const limit = 5_000_000;
  it("applies the status rules in order", () => {
    expect(capStatus({ limit, usedMtd: null, orderValue: 10 }).status).toBe("unknown");
    expect(capStatus({ limit, usedMtd: limit, orderValue: 0 }).status).toBe("reached");
    expect(capStatus({ limit, usedMtd: 4_999_000, orderValue: 1_001 }).status).toBe("would_exceed");
    expect(capStatus({ limit, usedMtd: 4_999_000, orderValue: 1_000 }).status).toBe("near");
    expect(capStatus({ limit, usedMtd: 4_000_001, orderValue: 500_000 }).status).toBe("near");
    expect(capStatus({ limit, usedMtd: 4_000_000, orderValue: 500_000 }).status).toBe("ok");
  });

  it("reports headroom after the order", () => {
    expect(capStatus({ limit, usedMtd: 3_000_000, orderValue: 250_000 })).toEqual({
      usedMtd: 3_000_000,
      orderValue: 250_000,
      headroomAfter: 1_750_000,
      status: "ok",
    });
  });
});

describe("pickOptions", () => {
  const cap = (status: "ok" | "near" | "would_exceed" | "reached" | "unknown") => ({
    usedMtd: 0,
    orderValue: 0,
    headroomAfter: 0,
    status,
  });

  it("labels the first eligible companies A, B, C in ranked order", () => {
    const result = pickOptions(
      [
        company("Over", { coveredCount: 5, cap: cap("would_exceed") }),
        company("C1", { coveredCount: 4, cap: cap("ok") }),
        company("Full", { coveredCount: 4, cap: cap("reached") }),
        company("C2", { coveredCount: 3, cap: cap("near") }),
        company("C3", { coveredCount: 2, cap: cap("ok") }),
        company("C4", { coveredCount: 1, cap: cap("ok") }),
      ],
      3,
      { foundCount: 5, capError: null },
    );
    expect(result.options).toEqual(["C1", "C2", "C3"]);
    expect(result.companies.map((row) => row.option)).toEqual([null, "A", null, "B", "C", null]);
    expect(result.noOptionReason).toBeNull();
  });

  it("still labels a cap-exempt company that is over the cap", () => {
    const result = pickOptions(
      [
        company("Pinned", { coveredCount: 5, cap: cap("reached"), warehousePriority: 1, capExempt: true }),
        company("C1", { coveredCount: 4, cap: cap("ok") }),
      ],
      3,
      { foundCount: 5, capError: null },
    );
    expect(result.options).toEqual(["Pinned", "C1"]);
  });

  it("still labels a cap-exempt company when month-to-date sales cannot be read", () => {
    const result = pickOptions(
      [company("Pinned", { coveredCount: 2, cap: cap("unknown"), warehousePriority: 1, capExempt: true })],
      3,
      { foundCount: 2, capError: "boom" },
    );
    expect(result.options).toEqual(["Pinned"]);
    expect(result.noOptionReason).toBeNull();
  });

  it("never labels a company with zero coverage and returns fewer options when fewer qualify", () => {
    const result = pickOptions(
      [company("C1", { coveredCount: 2, cap: cap("ok") }), company("C2", { coveredCount: 0, cap: cap("ok") })],
      3,
      { foundCount: 2, capError: null },
    );
    expect(result.options).toEqual(["C1"]);
  });

  it("explains why there are no options", () => {
    const over = [company("C1", { coveredCount: 2, cap: cap("would_exceed") })];
    expect(pickOptions(over, 3, { foundCount: 2, capError: null }).noOptionReason).toBe("all_over_cap");
    expect(pickOptions(over, 3, { foundCount: 2, capError: "boom" }).noOptionReason).toBe("cap_unavailable");
    expect(
      pickOptions([company("C1", { cap: cap("ok") })], 3, { foundCount: 2, capError: null }).noOptionReason,
    ).toBe("no_coverage");
    expect(pickOptions(over, 3, { foundCount: 0, capError: null }).noOptionReason).toBe("no_found_skus");
  });
});

describe("readOrderAvailabilityConfig", () => {
  it("uses defaults and falls back on invalid values", () => {
    expect(readOrderAvailabilityConfig({})).toEqual({ capLkr: 5_000_000, optionCount: 3 });
    expect(
      readOrderAvailabilityConfig({ ORDER_AVAILABILITY_CAP_LKR: "abc", ORDER_AVAILABILITY_OPTION_COUNT: "9" }),
    ).toEqual({ capLkr: 5_000_000, optionCount: 3 });
    expect(
      readOrderAvailabilityConfig({ ORDER_AVAILABILITY_CAP_LKR: "100000", ORDER_AVAILABILITY_OPTION_COUNT: "2" }),
    ).toEqual({ capLkr: 100_000, optionCount: 2 });
  });
});

describe("buildDetail", () => {
  const response = {
    lines: [skuLine("S1"), skuLine("S2", 3), skuLine("S3"), skuLine("NF", 1, { found: false })],
    companies: [
      company("C1", {
        lines: {
          S1: { status: "covered", available: 4, byWarehouse: [{ warehouse: "Main - C1", available: 4, priority: null }] },
          S2: { status: "short", available: 1, byWarehouse: [{ warehouse: "Main - C1", available: 1, priority: null }] },
          S3: { status: "missing", available: 0, byWarehouse: [] },
        },
      }),
      company("C2", {
        lines: {
          S1: { status: "covered", available: 2, byWarehouse: [{ warehouse: "Main - C2", available: 2, priority: null }] },
          S2: { status: "covered", available: 3, byWarehouse: [{ warehouse: "Main - C2", available: 3, priority: null }] },
          S3: { status: "missing", available: 0, byWarehouse: [] },
        },
      }),
      company("C3", {
        lines: {
          S1: { status: "missing", available: 0, byWarehouse: [] },
          S2: {
            status: "covered",
            available: 9,
            byWarehouse: [
              { warehouse: "Main A - C3", available: 7, priority: null },
              { warehouse: "Main B - C3", available: 2, priority: 1 },
            ],
          },
          S3: { status: "missing", available: 0, byWarehouse: [] },
        },
      }),
    ],
    shopCompanies: [
      {
        company: "C1",
        warehouses: ["Shop - C1"],
        lines: {
          S1: { status: "covered", available: 2, byWarehouse: [{ warehouse: "Shop - C1", available: 2, priority: null }] },
          S2: { status: "missing", available: 0, byWarehouse: [] },
          S3: { status: "short", available: 1, byWarehouse: [{ warehouse: "Shop - C1", available: 1, priority: null }] },
        },
      },
      {
        company: "C2",
        warehouses: ["Shop - C2"],
        lines: {
          S1: { status: "missing", available: 0, byWarehouse: [] },
          S2: { status: "covered", available: 4, byWarehouse: [{ warehouse: "Shop - C2", available: 4, priority: null }] },
          S3: { status: "missing", available: 0, byWarehouse: [] },
        },
      },
      {
        company: "ShopOnly",
        warehouses: ["Shop - Only"],
        lines: {
          S1: { status: "short", available: 3, byWarehouse: [{ warehouse: "Shop - Only", available: 3, priority: null }] },
          S2: { status: "missing", available: 0, byWarehouse: [] },
          S3: { status: "missing", available: 0, byWarehouse: [] },
        },
      },
    ],
  } as unknown as OrderAvailabilityResponse;

  it("shows own stock for covered SKUs and other-company sources, largest first, for the rest", () => {
    const detail = buildDetail(response, "C1");
    expect(detail?.covered).toEqual([
      { key: "S1", sku: "S1", qty: 1, byWarehouse: [{ warehouse: "Main - C1", available: 4, priority: null }] },
    ]);
    expect(detail?.toMove).toEqual([
      {
        key: "S2",
        sku: "S2",
        qty: 3,
        status: "short",
        ownAvailable: 1,
        sources: [
          { company: "C3", warehouse: "Main B - C3", available: 2, priority: 1 },
          { company: "C3", warehouse: "Main A - C3", available: 7, priority: null },
          { company: "C2", warehouse: "Main - C2", available: 3, priority: null },
        ],
        availableAnywhere: true,
      },
      {
        key: "S3",
        sku: "S3",
        qty: 1,
        status: "missing",
        ownAvailable: 0,
        sources: [],
        availableAnywhere: false,
      },
    ]);
  });

  it("lists shop stock separately and keeps it out of main covered/toMove", () => {
    const detail = buildDetail(response, "C1");
    expect(detail?.shops).toEqual([
      {
        key: "S1",
        sku: "S1",
        qty: 1,
        own: [{ warehouse: "Shop - C1", available: 2, priority: null }],
        ownAvailable: 2,
        sources: [{ company: "ShopOnly", warehouse: "Shop - Only", available: 3, priority: null }],
      },
      {
        key: "S2",
        sku: "S2",
        qty: 3,
        own: [],
        ownAvailable: 0,
        sources: [{ company: "C2", warehouse: "Shop - C2", available: 4, priority: null }],
      },
      {
        key: "S3",
        sku: "S3",
        qty: 1,
        own: [{ warehouse: "Shop - C1", available: 1, priority: null }],
        ownAvailable: 1,
        sources: [],
      },
    ]);
    expect(detail?.covered.some((row) => row.byWarehouse.some((w) => w.warehouse.startsWith("Shop")))).toBe(false);
    expect(detail?.toMove.some((row) => row.sources.some((s) => s.warehouse.startsWith("Shop")))).toBe(false);
  });

  it("returns null for an unknown company", () => {
    expect(buildDetail(response, "Nope")).toBeNull();
  });
});
