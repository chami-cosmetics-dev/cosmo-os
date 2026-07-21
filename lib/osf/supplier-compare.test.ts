import { describe, expect, it } from "vitest";

import type { SupplierPurchaseSummary } from "@/lib/osf/erp-purchases";
import {
  isRecently,
  mergeSupplierPurchaseMaps,
  rankSupplierOptions,
  RECENTLY_DAYS,
} from "@/lib/osf/supplier-compare";

function summary(
  partial: Partial<SupplierPurchaseSummary> & Pick<SupplierPurchaseSummary, "supplierKey" | "displayName">,
): SupplierPurchaseSummary {
  return {
    bestEverRate: null,
    bestEverDate: null,
    lastRate: null,
    lastDate: null,
    lastQty: null,
    ...partial,
  };
}

describe("isRecently", () => {
  it(`is true within ${RECENTLY_DAYS} days inclusive`, () => {
    const asOf = new Date(Date.UTC(2026, 6, 21)); // 2026-07-21
    expect(isRecently("2026-07-21", asOf)).toBe(true);
    expect(isRecently("2026-06-21", asOf)).toBe(true); // exactly 30 days
    expect(isRecently("2026-06-20", asOf)).toBe(false);
  });

  it("false when date missing", () => {
    expect(isRecently(null)).toBe(false);
    expect(isRecently(undefined)).toBe(false);
  });
});

describe("rankSupplierOptions", () => {
  const asOf = new Date(Date.UTC(2026, 6, 21));

  it("ranks by best-ever ascending with Best Option 1 label", () => {
    const ranked = rankSupplierOptions(
      [
        summary({
          supplierKey: "c",
          displayName: "C",
          bestEverRate: 110,
          lastDate: "2026-01-01",
          lastRate: 110,
        }),
        summary({
          supplierKey: "a",
          displayName: "A",
          bestEverRate: 75,
          bestEverDate: "2025-11-12",
          lastRate: 90,
          lastDate: "2026-07-06",
        }),
        summary({
          supplierKey: "b",
          displayName: "B",
          bestEverRate: 80,
          lastRate: 80,
          lastDate: "2026-03-15",
        }),
      ],
      asOf,
    );
    expect(ranked.map((r) => r.displayName)).toEqual(["A", "B", "C"]);
    expect(ranked[0]!.optionLabel).toBe("Best Option 1");
    expect(ranked[1]!.optionLabel).toBe("Option 2");
    expect(ranked[2]!.optionLabel).toBe("Option 3");
    expect(ranked[0]!.lastPurchasedFrom).toBe(true);
    expect(ranked.filter((r) => r.lastPurchasedFrom)).toHaveLength(1);
    expect(ranked[0]!.recently).toBe(true);
    expect(ranked[1]!.recently).toBe(false);
  });

  it("breaks best-ever ties with newer lastDate", () => {
    const ranked = rankSupplierOptions(
      [
        summary({
          supplierKey: "old",
          displayName: "Old",
          bestEverRate: 50,
          lastDate: "2026-01-01",
          lastRate: 50,
        }),
        summary({
          supplierKey: "new",
          displayName: "New",
          bestEverRate: 50,
          lastDate: "2026-07-01",
          lastRate: 50,
        }),
      ],
      asOf,
    );
    expect(ranked[0]!.displayName).toBe("New");
    expect(ranked[1]!.displayName).toBe("Old");
  });

  it("puts unpriced suppliers after priced", () => {
    const ranked = rankSupplierOptions(
      [
        summary({
          supplierKey: "none",
          displayName: "None",
          lastDate: "2026-07-20",
        }),
        summary({
          supplierKey: "priced",
          displayName: "Priced",
          bestEverRate: 100,
          lastRate: 100,
          lastDate: "2026-01-01",
        }),
      ],
      asOf,
    );
    expect(ranked[0]!.displayName).toBe("Priced");
    expect(ranked[1]!.displayName).toBe("None");
    expect(ranked[1]!.optionRank).toBe(2);
  });

  it("assigns single lastPurchasedFrom on date tie to first in stable sort", () => {
    const ranked = rankSupplierOptions(
      [
        summary({
          supplierKey: "b",
          displayName: "B",
          bestEverRate: 20,
          lastDate: "2026-07-10",
          lastRate: 20,
        }),
        summary({
          supplierKey: "a",
          displayName: "A",
          bestEverRate: 10,
          lastDate: "2026-07-10",
          lastRate: 10,
        }),
      ],
      asOf,
    );
    expect(ranked.filter((r) => r.lastPurchasedFrom)).toHaveLength(1);
    expect(ranked.find((r) => r.lastPurchasedFrom)?.displayName).toBe("A");
  });
});

describe("mergeSupplierPurchaseMaps", () => {
  it("takes min best-ever and newest last across instances", () => {
    const a = new Map([
      [
        "acme",
        summary({
          supplierKey: "acme",
          displayName: "Acme",
          bestEverRate: 80,
          bestEverDate: "2026-01-01",
          lastRate: 80,
          lastDate: "2026-07-10",
        }),
      ],
    ]);
    const b = new Map([
      [
        "acme",
        summary({
          supplierKey: "acme",
          displayName: "Acme",
          bestEverRate: 70,
          bestEverDate: "2025-06-01",
          lastRate: 75,
          lastDate: "2026-07-05",
        }),
      ],
    ]);
    const merged = mergeSupplierPurchaseMaps([a, b]);
    const acme = merged.get("acme")!;
    expect(acme.bestEverRate).toBe(70);
    expect(acme.bestEverDate).toBe("2025-06-01");
    expect(acme.lastDate).toBe("2026-07-10");
    expect(acme.lastRate).toBe(80);
  });
});
