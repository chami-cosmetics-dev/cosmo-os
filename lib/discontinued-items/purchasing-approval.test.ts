import { describe, expect, it } from "vitest";

import {
  applicableErps,
  matchesPurchasingApprovalFilter,
  presenceOf,
  stageAfterClicks,
} from "@/lib/discontinued-items/purchasing-approval";

describe("presenceOf", () => {
  it("maps ERP membership to Present in", () => {
    expect(presenceOf(true, true)).toBe("BOTH");
    expect(presenceOf(true, false)).toBe("ERP1_ONLY");
    expect(presenceOf(false, true)).toBe("ERP2_ONLY");
    expect(presenceOf(false, false)).toBeNull();
  });
});

describe("applicableErps", () => {
  it("only the ERPs the item is in are clickable", () => {
    expect(applicableErps("BOTH")).toEqual(["erp1", "erp2"]);
    expect(applicableErps("ERP1_ONLY")).toEqual(["erp1"]);
    expect(applicableErps("ERP2_ONLY")).toEqual(["erp2"]);
    expect(applicableErps(null)).toEqual([]);
  });
});

describe("stageAfterClicks", () => {
  it("nothing clicked → awaiting approval", () => {
    expect(stageAfterClicks("BOTH", { erp1: false, erp2: false })).toBe("AWAITING_APPROVAL");
  });

  it("in both, one clicked → pending (either side)", () => {
    expect(stageAfterClicks("BOTH", { erp1: true, erp2: false })).toBe("PENDING");
    expect(stageAfterClicks("BOTH", { erp1: false, erp2: true })).toBe("PENDING");
  });

  it("in both, both clicked → approved for Shopify draft", () => {
    expect(stageAfterClicks("BOTH", { erp1: true, erp2: true })).toBe("SHOPIFY_DRAFT");
  });

  it("ERP 1 only → approved for Shopify draft", () => {
    expect(stageAfterClicks("ERP1_ONLY", { erp1: true, erp2: false })).toBe("SHOPIFY_DRAFT");
  });

  it("ERP 2 only → done, not sent to SEO", () => {
    expect(stageAfterClicks("ERP2_ONLY", { erp1: false, erp2: true })).toBe("DONE");
  });

  it("a click on a non-applicable ERP does not count", () => {
    expect(stageAfterClicks("ERP1_ONLY", { erp1: false, erp2: true })).toBe("AWAITING_APPROVAL");
  });
});

describe("matchesPurchasingApprovalFilter", () => {
  it("open = not yet approved (pending included)", () => {
    expect(matchesPurchasingApprovalFilter("AWAITING_APPROVAL", "open")).toBe(true);
    expect(matchesPurchasingApprovalFilter("PENDING", "open")).toBe(true);
    expect(matchesPurchasingApprovalFilter("SHOPIFY_DRAFT", "open")).toBe(false);
    expect(matchesPurchasingApprovalFilter("DONE", "approved")).toBe(true);
    expect(matchesPurchasingApprovalFilter("AWAITING_APPROVAL", "pending")).toBe(false);
  });
});
