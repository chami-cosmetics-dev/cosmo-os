/** Fixed allocation buckets (Insight / ContactMaster.assignedMerchant). */
export const STAFF_SALES_ASSIGNED_MERCHANT = "STAFF SALES";
export const STAFF_SALES_ASSIGNEE_ID = "staff-sales";
/** Friendlier dropdown label; stored value stays STAFF SALES. */
export const STAFF_SALES_DISPLAY_LABEL = "Staff category";

export const ERROR_NUMBER_ASSIGNED_MERCHANT = "ERROR NUMBER";
export const ERROR_NUMBER_ASSIGNEE_ID = "error-number";
/** Friendlier dropdown label; stored value stays ERROR NUMBER. */
export const ERROR_NUMBER_DISPLAY_LABEL = "Error number category";

const FIXED_ASSIGNEE_BUCKETS: Array<{ id: string; label: string; display: string }> = [
  {
    id: STAFF_SALES_ASSIGNEE_ID,
    label: STAFF_SALES_ASSIGNED_MERCHANT,
    display: STAFF_SALES_DISPLAY_LABEL,
  },
  {
    id: ERROR_NUMBER_ASSIGNEE_ID,
    label: ERROR_NUMBER_ASSIGNED_MERCHANT,
    display: ERROR_NUMBER_DISPLAY_LABEL,
  },
];

function norm(value: string): string {
  return value.trim().toLowerCase();
}

export function formatAllocationAssigneeLabel(storedLabel: string): string {
  const key = norm(storedLabel);
  for (const bucket of FIXED_ASSIGNEE_BUCKETS) {
    if (key === norm(bucket.label)) return bucket.display;
  }
  return storedLabel;
}

export function withStaffSalesAssignee(
  assignees: Array<{ id: string; label: string }>
): Array<{ id: string; label: string }> {
  const existing = new Set(assignees.map((a) => norm(a.label)));
  const missing = FIXED_ASSIGNEE_BUCKETS.filter((b) => !existing.has(norm(b.label))).map(
    (b) => ({ id: b.id, label: b.label })
  );
  if (missing.length === 0) return assignees;
  return [...missing, ...assignees];
}

export function withStaffSalesAssignedMerchant(labels: string[]): string[] {
  const existing = new Set(labels.map(norm));
  const missing = FIXED_ASSIGNEE_BUCKETS.map((b) => b.label).filter(
    (label) => !existing.has(norm(label))
  );
  if (missing.length === 0) return labels;
  return [...missing, ...labels];
}
