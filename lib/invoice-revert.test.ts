import { describe, expect, it } from "vitest";

import { getOrderListFulfillmentStageBadges } from "./fulfillment-stage-display";
import {
  INVOICE_REVERT_CREDIT_NOTE_TEMPLATE,
  INVOICE_REVERT_STAGE_ONLY_TEMPLATE,
  isFinanceCreditNoteRevert,
  isInvoiceRevertStageOnly,
} from "./invoice-revert";

describe("isInvoiceRevertStageOnly", () => {
  it("is true only when the return is revert-only", () => {
    expect(isInvoiceRevertStageOnly([INVOICE_REVERT_STAGE_ONLY_TEMPLATE])).toBe(true);
    expect(isInvoiceRevertStageOnly([INVOICE_REVERT_CREDIT_NOTE_TEMPLATE])).toBe(false);
    expect(
      isInvoiceRevertStageOnly([
        INVOICE_REVERT_STAGE_ONLY_TEMPLATE,
        INVOICE_REVERT_CREDIT_NOTE_TEMPLATE,
      ]),
    ).toBe(false);
  });
});

describe("isFinanceCreditNoteRevert", () => {
  it("keeps the void path for a credit-note revert", () => {
    expect(
      isFinanceCreditNoteRevert({
        fulfillmentStage: "delivery_complete",
        revertedFromInvoiceCompleteAt: new Date(),
        returnTemplates: [INVOICE_REVERT_CREDIT_NOTE_TEMPLATE],
      }),
    ).toBe(true);
  });

  it("skips the void path for revert-only", () => {
    expect(
      isFinanceCreditNoteRevert({
        fulfillmentStage: "delivery_complete",
        revertedFromInvoiceCompleteAt: new Date(),
        returnTemplates: [INVOICE_REVERT_STAGE_ONLY_TEMPLATE],
      }),
    ).toBe(false);
  });
});

describe("getOrderListFulfillmentStageBadges", () => {
  it("shows partial void after a credit-note revert", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "delivery_complete",
      financialStatus: "refunded",
      revertedFromInvoiceCompleteAt: new Date(),
    });
    expect(badges[0]?.key).toBe("partial_void");
  });

  it("shows redispatch after revert-only", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "delivery_complete",
      financialStatus: "paid",
      revertedFromInvoiceCompleteAt: new Date(),
    });
    expect(badges[0]?.key).toBe("invoice_revert_redispatch");
  });
});
