import { describe, expect, it } from "vitest";

import {
  ERROR_NUMBER_ASSIGNED_MERCHANT,
  ERROR_NUMBER_DISPLAY_LABEL,
  STAFF_SALES_ASSIGNED_MERCHANT,
  STAFF_SALES_DISPLAY_LABEL,
  formatAllocationAssigneeLabel,
  withStaffSalesAssignee,
  withStaffSalesAssignedMerchant,
} from "@/lib/contacts/staff-sales-allocation";

describe("staff-sales-allocation", () => {
  it("formats fixed buckets as category labels", () => {
    expect(formatAllocationAssigneeLabel(STAFF_SALES_ASSIGNED_MERCHANT)).toBe(
      STAFF_SALES_DISPLAY_LABEL
    );
    expect(formatAllocationAssigneeLabel(ERROR_NUMBER_ASSIGNED_MERCHANT)).toBe(
      ERROR_NUMBER_DISPLAY_LABEL
    );
    expect(formatAllocationAssigneeLabel("MER91")).toBe("MER91");
  });

  it("prepends staff + error-number assignees once", () => {
    const once = withStaffSalesAssignee([{ id: "u1", label: "Alice" }]);
    expect(once.slice(0, 2)).toEqual([
      { id: "staff-sales", label: STAFF_SALES_ASSIGNED_MERCHANT },
      { id: "error-number", label: ERROR_NUMBER_ASSIGNED_MERCHANT },
    ]);
    expect(withStaffSalesAssignee(once)).toEqual(once);
  });

  it("prepends fixed merchant labels once", () => {
    expect(withStaffSalesAssignedMerchant(["MER91"]).slice(0, 2)).toEqual([
      STAFF_SALES_ASSIGNED_MERCHANT,
      ERROR_NUMBER_ASSIGNED_MERCHANT,
    ]);
    expect(
      withStaffSalesAssignedMerchant([
        STAFF_SALES_ASSIGNED_MERCHANT,
        ERROR_NUMBER_ASSIGNED_MERCHANT,
        "MER91",
      ])
    ).toEqual([
      STAFF_SALES_ASSIGNED_MERCHANT,
      ERROR_NUMBER_ASSIGNED_MERCHANT,
      "MER91",
    ]);
  });
});
