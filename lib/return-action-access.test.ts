import { describe, expect, it } from "vitest";

import {
  canPerformReturnAction,
  canRearrangeReturn,
  canTakeMerchantReturnActions,
  isMerchantReturnAction,
} from "@/lib/return-action-access";

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
    expect(canTakeMerchantReturnActions(["stores-level-01"])).toBe(false);
  });

  it("lets store roles rearrange without cancel or payment changes", () => {
    expect(canRearrangeReturn(["stores"])).toBe(true);
    expect(canRearrangeReturn(["stores-level-02"])).toBe(true);
    expect(canRearrangeReturn(["warehouse"])).toBe(true);
    expect(canRearrangeReturn(["viewer"])).toBe(false);
    expect(canPerformReturnAction("rearrange", ["stores-level-01"])).toBe(true);
    expect(canPerformReturnAction("confirm_rearrange_paid", ["stores"])).toBe(true);
    expect(canPerformReturnAction("request_cancel", ["stores"])).toBe(false);
    expect(canPerformReturnAction("request_finance_approval", ["stores-level-01"])).toBe(false);
    expect(canPerformReturnAction("resend_void_approval", ["stores"])).toBe(false);
    expect(canPerformReturnAction("mark_returned_to_store", ["stores"])).toBe(true);
    expect(canPerformReturnAction("rearrange", ["Merchant 01"])).toBe(true);
  });
});
