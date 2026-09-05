import { describe, expect, it } from "vitest";

import { checkPackSizeMismatch, parsePackSize } from "./pack-size";

describe("parsePackSize", () => {
  it("parses ml and liters correctly", () => {
    expect(parsePackSize("CeraVe Moisturising Lotion 236ml")).toEqual({
      rawNumber: 236,
      baseValue: 236,
      unit: "ml",
      normalized: "236ml",
    });

    expect(parsePackSize("Micellar Water 1.5L bottle")).toEqual({
      rawNumber: 1.5,
      baseValue: 1500,
      unit: "ml",
      normalized: "1500ml",
    });

    expect(parsePackSize("Shampoo 500 ml")).toEqual({
      rawNumber: 500,
      baseValue: 500,
      unit: "ml",
      normalized: "500ml",
    });
  });

  it("parses grams and kilograms correctly", () => {
    expect(parsePackSize("Face Cleanser 100g")).toEqual({
      rawNumber: 100,
      baseValue: 100,
      unit: "g",
      normalized: "100g",
    });

    expect(parsePackSize("Protein Powder 1kg tub")).toEqual({
      rawNumber: 1,
      baseValue: 1000,
      unit: "g",
      normalized: "1000g",
    });
  });

  it("parses count, tablets, and capsules correctly", () => {
    expect(parsePackSize("Vitamin C 60 capsules")).toEqual({
      rawNumber: 60,
      baseValue: 60,
      unit: "pcs",
      normalized: "60pcs",
    });

    expect(parsePackSize("Biotin 30 tabs")).toEqual({
      rawNumber: 30,
      baseValue: 30,
      unit: "pcs",
      normalized: "30pcs",
    });
  });

  it("returns null for text without identifiable size", () => {
    expect(parsePackSize("Lipstick Velvet Red")).toBeNull();
    expect(parsePackSize("")).toBeNull();
    expect(parsePackSize(null)).toBeNull();
  });
});

describe("checkPackSizeMismatch", () => {
  it("detects size mismatch in same units", () => {
    const res = checkPackSizeMismatch(
      "CeraVe Moisturising Lotion 236ml",
      "CeraVe Daily Moisturising Lotion 473ml",
    );
    expect(res.mismatch).toBe(true);
    expect(res.ourSize).toBe("236ml");
    expect(res.competitorSize).toBe("473ml");
  });

  it("detects unit mismatch (ml vs g)", () => {
    const res = checkPackSizeMismatch("Hand Cream 100ml", "Hand Cream 100g");
    expect(res.mismatch).toBe(true);
    expect(res.ourSize).toBe("100ml");
    expect(res.competitorSize).toBe("100g");
  });

  it("confirms match for identical sizes", () => {
    const res = checkPackSizeMismatch(
      "The Ordinary Niacinamide 10% + Zinc 1% 30ml",
      "Ordinary Niacinamide Serum 30 ml",
    );
    expect(res.mismatch).toBe(false);
    expect(res.ourSize).toBe("30ml");
    expect(res.competitorSize).toBe("30ml");
  });

  it("does not report mismatch when size cannot be parsed from one or both", () => {
    const res = checkPackSizeMismatch(
      "CeraVe Moisturising Lotion",
      "CeraVe Moisturising Lotion 236ml",
    );
    expect(res.mismatch).toBe(false);
  });
});
