/** Explicit RBAC keys for optional extra reminder bubbles (Roles UI). */
export const REMINDER_BUBBLE_PERMISSIONS = [
  {
    key: "reminders.erp_sync_warning",
    category: "erp_sync_warning" as const,
  },
  {
    key: "reminders.finance_approval",
    category: "finance_approval" as const,
  },
  {
    key: "reminders.add_samples",
    category: "add_samples" as const,
  },
  {
    key: "reminders.print",
    category: "print" as const,
  },
  {
    key: "reminders.ready_dispatch",
    category: "ready_dispatch" as const,
  },
  {
    key: "reminders.rearrange_dispatch",
    category: "rearrange_dispatch" as const,
  },
  {
    key: "reminders.delivery_pending",
    category: "delivery_pending" as const,
  },
  {
    key: "reminders.invoice_complete",
    category: "invoice_complete" as const,
  },
  {
    key: "reminders.return_action",
    category: "return_action" as const,
  },
] as const;

export type ReminderBubbleCategory =
  (typeof REMINDER_BUBBLE_PERMISSIONS)[number]["category"];

export type ReminderBubblePermissionKey =
  (typeof REMINDER_BUBBLE_PERMISSIONS)[number]["key"];

export const ALL_REMINDER_BUBBLE_PERMISSION_KEYS: ReminderBubblePermissionKey[] =
  REMINDER_BUBBLE_PERMISSIONS.map((p) => p.key);

const REMINDER_BUBBLE_LABELS: Record<ReminderBubbleCategory, string> = {
  erp_sync_warning: "ERP sync warnings",
  finance_approval: "Finance approvals",
  add_samples: "Samples / free issue",
  print: "Print",
  ready_dispatch: "Ready to dispatch",
  rearrange_dispatch: "Rearrange dispatch",
  delivery_pending: "Delivery pending",
  invoice_complete: "Invoice complete",
  return_action: "Returned orders",
};

/**
 * Page/system permissions that grant each bubble by default (no reminders.* tick needed).
 * e.g. finance.approvals.read or finance.approvals.manage → Finance approvals bubble.
 */
export const REMINDER_DEFAULT_PAGE_PERMISSION: Record<ReminderBubbleCategory, string[]> = {
  erp_sync_warning: ["system.erp_sync.read"],
  finance_approval: ["finance.approvals.manage", "finance.approvals.read"],
  add_samples: ["fulfillment.sample_free_issue.read"],
  print: ["fulfillment.order_print.read"],
  ready_dispatch: ["fulfillment.ready_dispatch.read"],
  rearrange_dispatch: ["fulfillment.ready_dispatch.read"],
  delivery_pending: ["fulfillment.delivery_invoice.read"],
  invoice_complete: ["fulfillment.invoice_complete.read"],
  return_action: ["returns.read"],
};

/** @deprecated Use REMINDER_DEFAULT_PAGE_PERMISSION */
export const REMINDER_LEGACY_PAGE_PERMISSION = REMINDER_DEFAULT_PAGE_PERMISSION;

export function buildReminderBubblePermissionDescription(
  category: ReminderBubbleCategory,
): string {
  const label = REMINDER_BUBBLE_LABELS[category];
  const pagePerms = REMINDER_DEFAULT_PAGE_PERMISSION[category].join(" or ");
  return `Optional extra: ${label} bubble (shown by default when role has ${pagePerms})`;
}

export function reminderPermissionForCategory(
  category: ReminderBubbleCategory,
): ReminderBubblePermissionKey {
  return `reminders.${category}` as ReminderBubblePermissionKey;
}

/** True when a reminders.* key is already covered by selected page permissions. */
export function isReminderImpliedByPagePermissions(
  reminderKey: string,
  selectedPermissionKeys: string[],
): boolean {
  const def = REMINDER_BUBBLE_PERMISSIONS.find((p) => p.key === reminderKey);
  if (!def) return false;
  return REMINDER_DEFAULT_PAGE_PERMISSION[def.category].some((key) =>
    selectedPermissionKeys.includes(key),
  );
}

/**
 * Drop reminders.* that page perms already grant — keep only optional extras for storage.
 */
export function stripImpliedReminderPermissions(
  permissionKeys: string[],
): string[] {
  return permissionKeys.filter(
    (key) =>
      !key.startsWith("reminders.") ||
      !isReminderImpliedByPagePermissions(key, permissionKeys),
  );
}
