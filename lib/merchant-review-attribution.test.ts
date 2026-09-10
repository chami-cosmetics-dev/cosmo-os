import { describe, expect, it } from "vitest";

import {
  buildReviewCouponToMerchantMap,
  resolveReviewMerchant,
  REVIEW_DM_GENERAL_MERCHANT_ID,
  REVIEW_DM_GENERAL_MERCHANT_NAME,
} from "@/lib/merchant-review-attribution";

const sandali = {
  id: "u-sandali",
  knownName: "sandali",
  name: "Sadali Navodya",
  email: "s@example.com",
  couponCodes: ["MER91-Sandali", "MER91", "MER115", "MER115-DMG"],
};

describe("resolveReviewMerchant DM split", () => {
  const couponToMerchant = buildReviewCouponToMerchantMap([sandali]);

  it("attributes personal MER orders to the merchant user", () => {
    const hit = resolveReviewMerchant({
      sourceName: "web",
      discountCodes: [{ code: "MER91-Sandali" }],
      rawPayload: null,
      couponToMerchant,
    });
    expect(hit).toEqual({ id: "u-sandali", name: "sandali" });
  });

  it("attributes DM MER orders to DM General, not the DM holder", () => {
    const hit = resolveReviewMerchant({
      sourceName: "web",
      discountCodes: [{ code: "MER115" }],
      rawPayload: null,
      couponToMerchant,
    });
    expect(hit).toEqual({
      id: REVIEW_DM_GENERAL_MERCHANT_ID,
      name: REVIEW_DM_GENERAL_MERCHANT_NAME,
    });
  });

  it("prefers personal MER when order has both personal and DM codes", () => {
    const hit = resolveReviewMerchant({
      sourceName: "web",
      discountCodes: [{ code: "MER115" }, { code: "MER91" }],
      rawPayload: null,
      couponToMerchant,
    });
    expect(hit).toEqual({ id: "u-sandali", name: "sandali" });
  });

  it("sends DM-holder assignee without personal MER on order to DM General", () => {
    const hit = resolveReviewMerchant({
      sourceName: "web",
      discountCodes: [],
      rawPayload: null,
      assignedMerchantId: "u-sandali",
      assignedMerchant: sandali,
      couponToMerchant,
    });
    expect(hit).toEqual({
      id: REVIEW_DM_GENERAL_MERCHANT_ID,
      name: REVIEW_DM_GENERAL_MERCHANT_NAME,
    });
  });

  it("keeps personal assignee when order carries their MER", () => {
    const hit = resolveReviewMerchant({
      sourceName: "web",
      discountCodes: [{ code: "MER91" }],
      rawPayload: null,
      assignedMerchantId: "u-sandali",
      assignedMerchant: sandali,
      couponToMerchant,
    });
    expect(hit).toEqual({ id: "u-sandali", name: "sandali" });
  });
});
