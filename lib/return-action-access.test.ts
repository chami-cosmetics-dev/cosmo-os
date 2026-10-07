import { describe, expect, it } from "vitest";

import { canTakeMerchantReturnActions, isMerchantReturnAction } from "@/lib/return-action-access";

describe("return action access", () => {
  it("treats rearrange, cancel, and void resend as merchant actions", () => {
    expect(isMerchantReturnAction("rearrange")).toBe(true);
    expect(isMerchantReturnAction("request_cancel")).toBe(true);
    expect(isMerchantReturnAction("request_finance_approval")).toBe(true);
    expect(isMerchantReturnAction("resend_void_approval")).toBe(true);
    expect(isMerchantReturnAction(undefined)).toBe(true);
  });

  it("leaves mark returned to store open to store users", () => {
    expect(isMerchantReturnAction("mark_returned_to_store")).toBe(false);
  });

  it("allows merchant roles and company admins", () => {
    expect(canTakeMerchantReturnActions(["Merchant 01"])).toBe(true);
    expect(canTakeMerchantReturnActions(["admin"])).toBe(true);
    expect(canTakeMerchantReturnActions(["stores"])).toBe(false);
  });
});
