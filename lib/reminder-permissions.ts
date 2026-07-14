/** Explicit RBAC keys for each reminder bubble (assign per role in Roles UI). */
export const REMINDER_BUBBLE_PERMISSIONS = [
  {
    key: "reminders.erp_sync_warning",
    category: "erp_sync_warning" as const,
    description: "Reminder bubble: ERP sync warnings",
  },
  {
    key: "reminders.finance_approval",
    category: "finance_approval" as const,
    description: "Reminder bubble: Finance approvals",
  },
  {
    key: "reminders.add_samples",
    category: "add_samples" as const,
    description: "Reminder bubble: Samples / free issue",
  },
  {
    key: "reminders.print",
    category: "print" as const,
    description: "Reminder bubble: Print",
  },
  {
    key: "reminders.ready_dispatch",
    category: "ready_dispatch" as const,
    description: "Reminder bubble: Ready to dispatch",
  },
  {
    key: "reminders.rearrange_dispatch",
    category: "rearrange_dispatch" as const,
    description: "Reminder bubble: Rearrange dispatch",
  },
  {
    key: "reminders.delivery_pending",
    category: "delivery_pending" as const,
    description: "Reminder bubble: Delivery pending",
  },
  {
    key: "reminders.return_action",
    category: "return_action" as const,
    description: "Reminder bubble: Returned orders",
  },
] as const;

export type ReminderBubbleCategory =
  (typeof REMINDER_BUBBLE_PERMISSIONS)[number]["category"];

export type ReminderBubblePermissionKey =
  (typeof REMINDER_BUBBLE_PERMISSIONS)[number]["key"];

export const ALL_REMINDER_BUBBLE_PERMISSION_KEYS: ReminderBubblePermissionKey[] =
  REMINDER_BUBBLE_PERMISSIONS.map((p) => p.key);

/** Page/system permission that historically implied a bubble — used for one-time role backfill. */
export const REMINDER_LEGACY_PAGE_PERMISSION: Record<ReminderBubbleCategory, string[]> = {
  erp_sync_warning: ["system.erp_sync.read"],
  finance_approval: ["finance.approvals.manage", "finance.approvals.read"],
  add_samples: ["fulfillment.sample_free_issue.read"],
  print: ["fulfillment.order_print.read"],
  ready_dispatch: ["fulfillment.ready_dispatch.read"],
  rearrange_dispatch: ["fulfillment.ready_dispatch.read"],
  delivery_pending: ["fulfillment.delivery_invoice.read"],
  return_action: ["returns.read"],
};

export function reminderPermissionForCategory(
  category: ReminderBubbleCategory,
): ReminderBubblePermissionKey {
  return `reminders.${category}` as ReminderBubblePermissionKey;
}
