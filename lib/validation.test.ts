import { describe, expect, it } from "vitest";

import { stockTrendsQuerySchema, stockTrendsSeriesQuerySchema } from "@/lib/validation";

describe("stockTrendsQuerySchema", () => {
  it("defaults brand when omitted, with no priorityStatus/page/pageSize fields", () => {
    const result = stockTrendsQuerySchema.parse({});
    expect(result.brand).toBe("all");
    expect(result.createdDateFrom).toBeUndefined();
    expect(result.createdDateTo).toBeUndefined();
    expect("priorityStatus" in result).toBe(false);
    expect("page" in result).toBe(false);
    expect("pageSize" in result).toBe(false);
  });

  it("ignores a priorityStatus query param instead of validating it — filtering moved client-side", () => {
    const result = stockTrendsQuerySchema.safeParse({ priorityStatus: "anything" });
    expect(result.success).toBe(true);
    if (result.success) expect("priorityStatus" in result.data).toBe(false);
  });

  it("accepts well-formed createdDateFrom/createdDateTo", () => {
    const result = stockTrendsQuerySchema.safeParse({
      createdDateFrom: "2026-01-01",
      createdDateTo: "2026-03-31",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdDateFrom).toBe("2026-01-01");
      expect(result.data.createdDateTo).toBe("2026-03-31");
    }
  });

  it("rejects a malformed date", () => {
    expect(stockTrendsQuerySchema.safeParse({ createdDateFrom: "01/01/2026" }).success).toBe(false);
    expect(stockTrendsQuerySchema.safeParse({ createdDateTo: "not-a-date" }).success).toBe(false);
  });

  it("ignores page/pageSize query params — pagination is client-side now", () => {
    const result = stockTrendsQuerySchema.safeParse({ page: "3", pageSize: "100" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("page" in result.data).toBe(false);
      expect("pageSize" in result.data).toBe(false);
    }
  });

  it("passes through optional skuSearch and titleSearch", () => {
    const result = stockTrendsQuerySchema.parse({
      skuSearch: "CAN02",
      titleSearch: "Argan",
    });
    expect(result.skuSearch).toBe("CAN02");
    expect(result.titleSearch).toBe("Argan");
  });

  it("defaults sortOrder to asc and accepts desc", () => {
    expect(stockTrendsQuerySchema.parse({}).sortOrder).toBe("asc");
    expect(stockTrendsQuerySchema.parse({ sortOrder: "desc" }).sortOrder).toBe("desc");
    expect(stockTrendsQuerySchema.safeParse({ sortOrder: "newest" }).success).toBe(false);
  });

  it("defaults channel to all and accepts online/shop", () => {
    expect(stockTrendsQuerySchema.parse({}).channel).toBe("all");
    expect(stockTrendsQuerySchema.parse({ channel: "online" }).channel).toBe("online");
    expect(stockTrendsQuerySchema.parse({ channel: "shop" }).channel).toBe("shop");
    expect(stockTrendsQuerySchema.safeParse({ channel: "warehouse-x" }).success).toBe(false);
  });

  it("defaults movement to all and accepts fast/slow/early only", () => {
    expect(stockTrendsQuerySchema.parse({}).movement).toBe("all");
    for (const movement of ["all", "fast", "slow", "early"]) {
      expect(stockTrendsQuerySchema.parse({ movement }).movement).toBe(movement);
    }
    // "na" items are reachable via "all" only — not a filter value.
    expect(stockTrendsQuerySchema.safeParse({ movement: "na" }).success).toBe(false);
    expect(stockTrendsQuerySchema.safeParse({ movement: "FAST" }).success).toBe(false);
  });
});

describe("stockTrendsSeriesQuerySchema", () => {
  it("requires a non-empty sku", () => {
    expect(stockTrendsSeriesQuerySchema.safeParse({}).success).toBe(false);
    expect(stockTrendsSeriesQuerySchema.safeParse({ sku: "" }).success).toBe(false);
  });

  it("accepts a sku, with channel defaulting to all", () => {
    const result = stockTrendsSeriesQuerySchema.safeParse({ sku: "CAN02_1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBe("CAN02_1");
      expect(result.data.channel).toBe("all");
    }
  });

  it("passes through channel when given", () => {
    const result = stockTrendsSeriesQuerySchema.parse({ sku: "CAN02_1", channel: "online" });
    expect(result.channel).toBe("online");
  });
});
