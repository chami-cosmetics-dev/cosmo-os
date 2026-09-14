import { describe, expect, it } from "vitest";

import {
  STAFF_SALES_ASSIGNED_MERCHANT,
  STAFF_SALES_DISPLAY_LABEL,
  formatAllocationAssigneeLabel,
  withStaffSalesAssignee,
  withStaffSalesAssignedMerchant,
} from "@/lib/contacts/staff-sales-allocation";

describe("staff-sales-allocation", () => {
  it("formats STAFF SALES as Staff category", () => {
    expect(formatAllocationAssigneeLabel(STAFF_SALES_ASSIGNED_MERCHANT)).toBe(
      STAFF_SALES_DISPLAY_LABEL
    );
    expect(formatAllocationAssigneeLabel("MER91")).toBe("MER91");
  });

  it("prepends staff assignee once", () => {
    const once = withStaffSalesAssignee([{ id: "u1", label: "Alice" }]);
    expect(once[0]).toEqual({
      id: "staff-sales",
      label: STAFF_SALES_ASSIGNED_MERCHANT,
    });
    expect(withStaffSalesAssignee(once)).toEqual(once);
  });

  it("prepends staff merchant label once", () => {
    expect(withStaffSalesAssignedMerchant(["MER91"])[0]).toBe(
      STAFF_SALES_ASSIGNED_MERCHANT
    );
    expect(
      withStaffSalesAssignedMerchant([STAFF_SALES_ASSIGNED_MERCHANT, "MER91"])
    ).toEqual([STAFF_SALES_ASSIGNED_MERCHANT, "MER91"]);
  });
});
