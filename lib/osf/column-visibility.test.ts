import { describe, expect, it } from "vitest";

import {
  allCatalogKeySet,
  buildOsfAccessCatalog,
  expandLegacyColumnGroups,
  normalizeOsfColumnKeys,
  resolveEffectiveOsfColumnKeysFromMarks,
  stockAccessKey,
} from "@/lib/osf/column-access-catalog";
import type { OsfResolvedColumn } from "@/lib/osf/column-config";
import { hasFullOsfColumnAccess } from "@/lib/osf/column-visibility";

function ctx(perms: string[]) {
  return {
    user: { id: "u1", companyId: "c1", email: "a@b.com", name: "Test" },
    permissionKeys: perms,
    roleNames: [] as string[],
    sessionUser: {},
  };
}

const sampleColumns: OsfResolvedColumn[] = [
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
    warehouses: ["LMJ"],
  },
];

describe("hasFullOsfColumnAccess", () => {
  it("true for manage or permission", () => {
    expect(hasFullOsfColumnAccess(ctx(["purchasing.osf.manage"]))).toBe(true);
    expect(hasFullOsfColumnAccess(ctx(["purchasing.osf.permission"]))).toBe(true);
  });

  it("false for read-only", () => {
    expect(hasFullOsfColumnAccess(ctx(["purchasing.osf.read"]))).toBe(false);
  });
});

describe("buildOsfAccessCatalog", () => {
  it("includes stock/rop/order keys and static headers", () => {
    const catalog = buildOsfAccessCatalog(sampleColumns);
    const ids = new Set(catalog.map((c) => c.id));
    expect(ids.has(stockAccessKey("lmj"))).toBe(true);
    expect(ids.has("rop:lmj")).toBe(true);
    expect(ids.has("order:lmj")).toBe(true);
    expect(ids.has("Cosmetics MRP")).toBe(true);
    expect(ids.has("Sales Units")).toBe(true);
  });
});

describe("resolveEffectiveOsfColumnKeysFromMarks", () => {
  const catalogIds = allCatalogKeySet(buildOsfAccessCatalog(sampleColumns));

  it("full access returns all", () => {
    expect(resolveEffectiveOsfColumnKeysFromMarks([], true, catalogIds)).toBe("all");
  });

  it("unmarked restricted user gets empty set", () => {
    const keys = resolveEffectiveOsfColumnKeysFromMarks([], false, catalogIds);
    expect(keys).toEqual(new Set());
  });

  it("marked keys are kept; unknown ignored", () => {
    const keys = resolveEffectiveOsfColumnKeysFromMarks(
      ["Cosmetics MRP", "bogus", "rop:lmj"],
      false,
      catalogIds,
    ) as Set<string>;
    expect(keys.has("Cosmetics MRP")).toBe(true);
    expect(keys.has("rop:lmj")).toBe(true);
    expect(keys.has("bogus")).toBe(false);
  });
});

describe("expandLegacyColumnGroups / normalize", () => {
  it("maps legacy groups to static keys", () => {
    expect(expandLegacyColumnGroups(["margins", "pricing"])).toEqual([
      "Cosmetics Margin %",
      "OGF Margin %",
      "Cosmetics MRP",
      "Discounted Price",
      "OGF Price",
    ]);
  });

  it("normalizeOsfColumnKeys dedupes against catalog", () => {
    const ids = allCatalogKeySet(buildOsfAccessCatalog(sampleColumns));
    expect(normalizeOsfColumnKeys(["Cosmetics MRP", "Cosmetics MRP", "nope"], ids)).toEqual([
      "Cosmetics MRP",
    ]);
  });
});
