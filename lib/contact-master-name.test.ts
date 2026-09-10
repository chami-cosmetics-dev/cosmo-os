import { describe, expect, it } from "vitest";

import { shouldPreferIncomingContactName } from "@/lib/contact-master-name";

describe("shouldPreferIncomingContactName", () => {
  it("fills blank existing name when phone matched", () => {
    expect(
      shouldPreferIncomingContactName({
        existingName: null,
        incomingName: "Kumuduni Rathnayaka",
        phoneMatched: true,
        sourceType: "shopify_order",
      })
    ).toBe(true);
  });

  it("never renames without phone match", () => {
    expect(
      shouldPreferIncomingContactName({
        existingName: "Ms- kaushalya",
        incomingName: "Kumuduni Rathnayaka",
        phoneMatched: false,
        sourceType: "erpnext_si",
      })
    ).toBe(false);
  });

  it("overwrites Adapt/merchant name from ERP SI", () => {
    expect(
      shouldPreferIncomingContactName({
        existingName: "Ms- kaushalya",
        incomingName: "Kumuduni Rathnayaka",
        phoneMatched: true,
        sourceType: "erpnext_si",
      })
    ).toBe(true);
  });

  it("overwrites from ERP customer backfill", () => {
    expect(
      shouldPreferIncomingContactName({
        existingName: "Ms- kaushalya",
        incomingName: "Kumuduni Rathnayaka",
        phoneMatched: true,
        sourceType: "erp_customer_backfill",
      })
    ).toBe(true);
  });

  it("does not overwrite from Shopify when names differ", () => {
    expect(
      shouldPreferIncomingContactName({
        existingName: "Ms- kaushalya",
        incomingName: "Kumuduni Rathnayaka",
        phoneMatched: true,
        sourceType: "shopify_order",
      })
    ).toBe(false);
  });

  it("skips when names already match (case/spacing)", () => {
    expect(
      shouldPreferIncomingContactName({
        existingName: "  kumuduni  rathnayaka ",
        incomingName: "Kumuduni Rathnayaka",
        phoneMatched: true,
        sourceType: "erpnext_si",
      })
    ).toBe(false);
  });

  it("rejects phone-looking incoming names", () => {
    expect(
      shouldPreferIncomingContactName({
        existingName: "Ms- kaushalya",
        incomingName: "0768229455",
        phoneMatched: true,
        sourceType: "erpnext_si",
      })
    ).toBe(false);
  });
});
