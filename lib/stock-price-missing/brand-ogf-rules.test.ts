import { describe, expect, it } from "vitest";

import {
  brandRequiresOgf,
  classifyPriceGapForBrand,
} from "@/lib/stock-price-missing/brand-ogf-rules";

describe("brandRequiresOgf", () => {
  it("ERP1: only Cerave needs OGF", () => {
    expect(brandRequiresOgf("Cerave", "erp1")).toBe(true);
    expect(brandRequiresOgf("Olay", "erp1")).toBe(false);
    expect(brandRequiresOgf("Sebamed", "erp1")).toBe(false);
    expect(brandRequiresOgf("Neutrogena", "erp1")).toBe(false);
    expect(brandRequiresOgf(null, "erp1")).toBe(false);
  });

  it("ERP2: skip-list brands (incl Cerave) skip OGF; others need it", () => {
    expect(brandRequiresOgf("Cerave", "erp2")).toBe(false);
    expect(brandRequiresOgf("Olay", "erp2")).toBe(false);
    expect(brandRequiresOgf("Hada Labo", "erp2")).toBe(false);
    expect(brandRequiresOgf("Acnes", "erp2")).toBe(false);
    expect(brandRequiresOgf("Neutrogena", "erp2")).toBe(true);
    expect(brandRequiresOgf(null, "erp2")).toBe(true);
  });
});

describe("classifyPriceGapForBrand", () => {
  it("ERP1 non-Cerave: only flags Standard missing; OGF alone is fine", () => {
    expect(
      classifyPriceGapForBrand({
        hasStandard: true,
        hasOgf: false,
        brand: "Neutrogena",
        erp: "erp1",
      }),
    ).toBeNull();
    expect(
      classifyPriceGapForBrand({
        hasStandard: false,
        hasOgf: false,
        brand: "Olay",
        erp: "erp1",
      }),
    ).toBe("Standard");
  });

  it("Cerave ERP1: flags OGF when Standard present", () => {
    expect(
      classifyPriceGapForBrand({
        hasStandard: true,
        hasOgf: false,
        brand: "Cerave",
        erp: "erp1",
      }),
    ).toBe("OGF");
  });

  it("Cerave ERP1: Both when Standard + OGF missing", () => {
    expect(
      classifyPriceGapForBrand({
        hasStandard: false,
        hasOgf: false,
        brand: "Cerave",
        erp: "erp1",
      }),
    ).toBe("Both");
  });

  it("Cerave ERP2: OGF not required", () => {
    expect(
      classifyPriceGapForBrand({
        hasStandard: true,
        hasOgf: false,
        brand: "Cerave",
        erp: "erp2",
      }),
    ).toBeNull();
  });

  it("ERP2 non-skip brand: flags OGF when Standard present", () => {
    expect(
      classifyPriceGapForBrand({
        hasStandard: true,
        hasOgf: false,
        brand: "Neutrogena",
        erp: "erp2",
      }),
    ).toBe("OGF");
  });

  it("ERP2 skip-list brand: only flags Standard", () => {
    expect(
      classifyPriceGapForBrand({
        hasStandard: true,
        hasOgf: false,
        brand: "Olay",
        erp: "erp2",
      }),
    ).toBeNull();
    expect(
      classifyPriceGapForBrand({
        hasStandard: false,
        hasOgf: false,
        brand: "Olay",
        erp: "erp2",
      }),
    ).toBe("Standard");
  });
});
