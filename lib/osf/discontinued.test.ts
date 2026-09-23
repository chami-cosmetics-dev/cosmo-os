import { describe, expect, it } from "vitest";

import { isDiscontinuedForOsf } from "@/lib/osf/discontinued";

describe("isDiscontinuedForOsf", () => {
  it("drops SKUs discontinued on every ERP that has a priority", () => {
    expect(
      isDiscontinuedForOsf({
        erp1ProductPriority: "Discontinue",
        erp2ProductPriority: "Discontinue",
      }),
    ).toBe(true);
    expect(
      isDiscontinuedForOsf({
        erp1ProductPriority: "discontinue",
        erp2ProductPriority: null,
      }),
    ).toBe(true);
    expect(
      isDiscontinuedForOsf({
        erp1ProductPriority: "  ",
        erp2ProductPriority: "Discontinue",
      }),
    ).toBe(true);
  });

  it("keeps a SKU that is still live on one ERP", () => {
    expect(
      isDiscontinuedForOsf({
        erp1ProductPriority: "Discontinue",
        erp2ProductPriority: "Continue",
      }),
    ).toBe(false);
    expect(
      isDiscontinuedForOsf({
        erp1ProductPriority: "Top Priority",
        erp2ProductPriority: null,
      }),
    ).toBe(false);
  });

  it("uses item status only when both ERP priorities are blank", () => {
    expect(
      isDiscontinuedForOsf({
        erp1ProductPriority: null,
        erp2ProductPriority: "",
        itemStatusCategory: "DISCONTINUE",
      }),
    ).toBe(true);
    expect(
      isDiscontinuedForOsf({
        erp1ProductPriority: null,
        erp2ProductPriority: null,
        itemStatusCategory: "CONTINUE",
      }),
    ).toBe(false);
  });
});
