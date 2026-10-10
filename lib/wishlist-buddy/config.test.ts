import { describe, expect, it } from "vitest";

import {
  demoStockLookup,
  excludedWarehousesFor,
  parseStoreAliases,
  resolveStockLookupMode,
  resolveStoreHandleForLocation,
} from "./config";

describe("store aliases", () => {
  it("parses pairs and ignores junk", () => {
    const map = parseStoreAliases(" Buddy-Store-8866 = u71ajc-11 , bad, =x, y= ");
    expect([...map.entries()]).toEqual([["buddy-store-8866", "u71ajc-11"]]);
  });

  it("maps aliased stores and leaves others alone", () => {
    expect(resolveStoreHandleForLocation("buddy-store-8866", "buddy-store-8866=u71ajc-11")).toBe("u71ajc-11");
    expect(resolveStoreHandleForLocation("u71ajc-11", "buddy-store-8866=u71ajc-11")).toBe("u71ajc-11");
    expect(resolveStoreHandleForLocation("abc", undefined)).toBe("abc");
  });
});

describe("excludedWarehousesFor", () => {
  it("merges env list with the location warehouse without duplicates", () => {
    expect(excludedWarehousesFor("Main Warehouse - Cosmo", "Main Warehouse - Cosmo, Web Stock - Cosmo")).toEqual([
      "Main Warehouse - Cosmo",
      "Web Stock - Cosmo",
    ]);
    expect(excludedWarehousesFor(null, undefined)).toEqual([]);
  });
});

describe("resolveStockLookupMode", () => {
  it("defaults to erp and never allows demo in production", () => {
    expect(resolveStockLookupMode(undefined, "development")).toBe("erp");
    expect(resolveStockLookupMode(" OFF ", "production")).toBe("off");
    expect(resolveStockLookupMode("demo", "development")).toBe("demo");
    expect(resolveStockLookupMode("demo", "production")).toBe("off");
  });
});

describe("demoStockLookup", () => {
  it("returns fake stock, or none for NOSTOCK SKUs", () => {
    expect(demoStockLookup("ORD38_2").sources.length).toBeGreaterThan(0);
    expect(demoStockLookup("TEST-NOSTOCK-1").sources).toEqual([]);
  });
});
