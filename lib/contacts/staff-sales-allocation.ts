/** Fixed allocation bucket (Insight / ContactMaster.assignedMerchant). */
export const STAFF_SALES_ASSIGNED_MERCHANT = "STAFF SALES";

export const STAFF_SALES_ASSIGNEE_ID = "staff-sales";

/** Friendlier dropdown label; stored value stays STAFF SALES. */
export const STAFF_SALES_DISPLAY_LABEL = "Staff category";

export function formatAllocationAssigneeLabel(storedLabel: string): string {
  return storedLabel.trim().toLowerCase() === STAFF_SALES_ASSIGNED_MERCHANT.toLowerCase()
    ? STAFF_SALES_DISPLAY_LABEL
    : storedLabel;
}

export function withStaffSalesAssignee(
  assignees: Array<{ id: string; label: string }>
): Array<{ id: string; label: string }> {
  const hasStaff = assignees.some(
    (a) => a.label.trim().toLowerCase() === STAFF_SALES_ASSIGNED_MERCHANT.toLowerCase()
  );
  if (hasStaff) return assignees;
  return [
    { id: STAFF_SALES_ASSIGNEE_ID, label: STAFF_SALES_ASSIGNED_MERCHANT },
    ...assignees,
  ];
}

export function withStaffSalesAssignedMerchant(labels: string[]): string[] {
  const hasStaff = labels.some(
    (l) => l.trim().toLowerCase() === STAFF_SALES_ASSIGNED_MERCHANT.toLowerCase()
  );
  if (hasStaff) return labels;
  return [STAFF_SALES_ASSIGNED_MERCHANT, ...labels];
}
