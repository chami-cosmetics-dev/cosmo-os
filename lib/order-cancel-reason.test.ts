import { describe, expect, it } from "vitest";

import {
  resolveCancelReasonBackfill,
  resolveStoredCancelReason,
  shopifyCancelReasonFromPayload,
} from "@/lib/order-cancel-reason";
import { ERP_CANCEL_REASON_CREDIT_NOTE } from "@/lib/erp-credit-note-order-sync";

describe("resolveStoredCancelReason", () => {
  it("prefers order cancelReason", () => {
    expect(
      resolveStoredCancelReason({
        cancelReason: "  customer requested  ",
        returnCancelRemark: "return cancel",
        returnRemark: "UTC",
      }),
    ).toBe("customer requested");
  });

  it("falls back to mandatory return cancel remark", () => {
    expect(
      resolveStoredCancelReason({
        cancelReason: " ",
        returnCancelRemark: "out of stock",
        returnRemark: "Unable to Contact (UTC)",
      }),
    ).toBe("out of stock");
  });

  it("falls back to return remark when cancel remark was never requested", () => {
    expect(
      resolveStoredCancelReason({
        cancelReason: null,
        returnCancelRemark: null,
        returnRemark: "Unable to Contact (UTC)",
      }),
    ).toBe("Unable to Contact (UTC)");
  });
});

describe("resolveCancelReasonBackfill", () => {
  it("skips voids with no staff or return-stage signal", () => {
    expect(
      resolveCancelReasonBackfill({
        cancelReason: null,
        fulfillmentStage: "dispatched",
      }),
    ).toBeNull();
  });

  it("uses ERP credit note for returned-stage voids with no staff text", () => {
    expect(
      resolveCancelReasonBackfill({
        cancelReason: "  ",
        fulfillmentStage: "returned",
      }),
    ).toEqual({ reason: ERP_CANCEL_REASON_CREDIT_NOTE, source: "erp_credit_note" });
  });

  it("reads Shopify cancel_reason from the stored payload", () => {
    expect(shopifyCancelReasonFromPayload({ cancel_reason: "customer" })).toBe("customer");
    expect(shopifyCancelReasonFromPayload({ data: { cancel_reason: "other" } })).toBe("other");
  });
});
