import { describe, expect, it } from "vitest";

import {
  KEEP_ORIGINAL_COD_GATEWAY,
  isUnpaidBankTransferGateway,
  keepOriginalCodPaymentFields,
} from "@/lib/return-rearrange-original-payment";

describe("isUnpaidBankTransferGateway", () => {
  it("matches pending bank_transfer after a mistaken rearrange request", () => {
    expect(
      isUnpaidBankTransferGateway({
        financialStatus: "pending",
        paymentGatewayPrimary: "bank_transfer",
        paymentGatewayNames: ["bank_transfer"],
      }),
    ).toBe(true);
  });

  it("ignores paid bank transfer", () => {
    expect(
      isUnpaidBankTransferGateway({
        financialStatus: "paid",
        paymentGatewayPrimary: "bank_transfer",
        paymentGatewayNames: ["bank_transfer"],
      }),
    ).toBe(false);
  });

  it("ignores original Cash COD", () => {
    expect(
      isUnpaidBankTransferGateway({
        financialStatus: "pending",
        paymentGatewayPrimary: "Cash",
        paymentGatewayNames: ["Cash"],
      }),
    ).toBe(false);
  });
});

describe("keepOriginalCodPaymentFields", () => {
  it("restores Cosmo ERP Cash mop", () => {
    expect(keepOriginalCodPaymentFields()).toEqual({
      paymentGatewayPrimary: KEEP_ORIGINAL_COD_GATEWAY,
      paymentGatewayNames: ["Cash"],
      financialStatus: "pending",
    });
  });
});
