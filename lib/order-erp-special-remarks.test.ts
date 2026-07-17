import { describe, expect, it } from "vitest";

import { getErpSpecialRemarksFromPayload } from "@/lib/order-erp-special-remarks";

describe("getErpSpecialRemarksFromPayload", () => {
  it("reads custom_special_remarks from root payload", () => {
    expect(
      getErpSpecialRemarksFromPayload({
        custom_special_remarks: "Handle with care",
      }),
    ).toBe("Handle with care");
  });

  it("reads nested data payload and ignores None", () => {
    expect(
      getErpSpecialRemarksFromPayload({
        data: { custom_special_remarks: "None" },
      }),
    ).toBeNull();
    expect(
      getErpSpecialRemarksFromPayload({
        data: { special_remarks: "  Leave at gate  " },
      }),
    ).toBe("Leave at gate");
  });
});
