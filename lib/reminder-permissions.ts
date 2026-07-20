/** Explicit RBAC keys for reminder bubbles (Roles UI — must be ticked manually). */
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

export function buildReminderBubblePermissionDescription(
  category: ReminderBubbleCategory,
): string {
  const label = REMINDER_BUBBLE_LABELS[category];
  return `Show ${label} reminder bubble (must be granted explicitly)`;
}

export function reminderPermissionForCategory(
  category: ReminderBubbleCategory,
): ReminderBubblePermissionKey {
  return `reminders.${category}` as ReminderBubblePermissionKey;
}
