import type { TaskReminderCategory } from "@/lib/task-reminders";
import { hasReminderPermission } from "@/lib/task-reminders";
import {
  REMINDER_DEFAULT_PAGE_PERMISSION,
  reminderPermissionForCategory,
  type ReminderBubbleCategory,
} from "@/lib/reminder-permissions";

export type TaskReminderAudience = "admin" | "finance" | "merchant" | "store";

export type TaskReminderAccessContext = {
  permissionKeys: string[];
  roleNames: string[];
  userId?: string;
};

const OPS_ADMIN_ROLES = new Set(["super_admin", "admin", "manager"]);

const STORE_PERMISSION_PREFIXES = [
  "fulfillment.ready_dispatch.",
  "fulfillment.order_print.",
  "fulfillment.delivery_invoice.",
  "fulfillment.falcon_upload.",
  "fulfillment.waybill_lookup.",
] as const;

const SAMPLE_PERMISSION_KEYS = [
  "fulfillment.sample_free_issue.read",
  "fulfillment.sample_free_issue.manage",
] as const;

function hasStoreFulfillmentAccess(permissionKeys: string[]) {
  return permissionKeys.some((key) =>
    STORE_PERMISSION_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
}

function hasSampleFulfillmentAccess(permissionKeys: string[]) {
  return SAMPLE_PERMISSION_KEYS.some((key) => permissionKeys.includes(key));
}

function isFinanceRoleName(roleNames: string[]) {
  return roleNames.some(
    (role) => role === "finance" || role === "hod" || role.includes("finance"),
  );
}

function isMerchantRoleName(roleNames: string[]) {
  return roleNames.some(
    (role) => role === "merchant" || role.includes("merchant"),
  );
}

function isStoreRoleName(roleNames: string[]) {
  return roleNames.some(
    (role) =>
      role === "store" ||
      role.includes("store") ||
      role === "warehouse" ||
      role.includes("warehouse"),
  );
}

/**
 * Audience heuristics for data-scoping (e.g. merchant-only samples).
 * Bubble visibility: page permission OR explicit reminders.* (see canSeeTaskReminderCategory).
 */
export function resolveTaskReminderAudiences(
  context: TaskReminderAccessContext,
): Set<TaskReminderAudience> {
  const { roleNames, permissionKeys } = context;

  if (roleNames.some((role) => OPS_ADMIN_ROLES.has(role))) {
    return new Set(["admin"]);
  }

  // Named roles are exclusive — finance must not inherit store reminders from extra perms.
  if (isFinanceRoleName(roleNames)) {
    return new Set(["finance"]);
  }

  if (isMerchantRoleName(roleNames)) {
    return new Set(["merchant"]);
  }

  if (isStoreRoleName(roleNames)) {
    return new Set(["store"]);
  }

  if (
    hasReminderPermission(context, "finance.approvals.manage") ||
    hasReminderPermission(context, "finance.approvals.read") ||
    hasReminderPermission(context, "reminders.finance_approval")
  ) {
    if (!hasStoreFulfillmentAccess(permissionKeys) && !hasSampleFulfillmentAccess(permissionKeys)) {
      return new Set(["finance"]);
    }
  }

  if (hasStoreFulfillmentAccess(permissionKeys)) {
    return new Set(["store"]);
  }

  if (hasSampleFulfillmentAccess(permissionKeys)) {
    return new Set(["merchant"]);
  }

  return new Set();
}

function hasLegacyPagePermissionForCategory(
  context: TaskReminderAccessContext,
  category: TaskReminderCategory,
): boolean {
  const legacyKeys =
    REMINDER_DEFAULT_PAGE_PERMISSION[category as ReminderBubbleCategory] ?? [];
  return legacyKeys.some((key) => hasReminderPermission(context, key));
}

/**
 * Show a bubble if the user has the related page permission (existing flow)
 * OR an explicit reminders.* grant (extra / standalone bubble access).
 *
 * Named-role audience rules still apply so finance doesn't see store queues
 * just because they have returns.read from another duty — unless they also have
 * the matching reminders.* key (intentional override).
 */
export function canSeeTaskReminderCategory(
  context: TaskReminderAccessContext,
  category: TaskReminderCategory,
): boolean {
  const hasExplicitReminder = hasReminderPermission(
    context,
    reminderPermissionForCategory(category as ReminderBubbleCategory),
  );
  const hasLegacyPage = hasLegacyPagePermissionForCategory(context, category);

  if (!hasExplicitReminder && !hasLegacyPage) {
    return false;
  }

  const audiences = resolveTaskReminderAudiences(context);

  // Explicit reminders.* always wins — for giving extra bubbles beyond page access.
  if (hasExplicitReminder) {
    return true;
  }

  // Legacy page-perm path: keep audience gating so role types stay scoped.
  if (audiences.has("admin")) {
    return true;
  }

  if (audiences.size === 1 && audiences.has("finance")) {
    return category === "finance_approval" || category === "invoice_complete";
  }

  if (audiences.size === 1 && audiences.has("merchant")) {
    return category === "add_samples";
  }

  if (audiences.size === 1 && audiences.has("store")) {
    return (
      category === "print" ||
      category === "ready_dispatch" ||
      category === "rearrange_dispatch" ||
      category === "delivery_pending" ||
      category === "invoice_complete" ||
      category === "return_action" ||
      category === "erp_sync_warning"
    );
  }

  // Custom roles with no named audience: page perm alone is enough.
  return hasLegacyPage;
}

const ALL_TASK_REMINDER_CATEGORIES = [
  "erp_sync_warning",
  "finance_approval",
  "add_samples",
  "print",
  "ready_dispatch",
  "rearrange_dispatch",
  "delivery_pending",
  "invoice_complete",
  "return_action",
] as const satisfies readonly TaskReminderCategory[];

export function listVisibleTaskReminderCategories(
  context: TaskReminderAccessContext,
): TaskReminderCategory[] {
  return ALL_TASK_REMINDER_CATEGORIES.filter((category) =>
    canSeeTaskReminderCategory(context, category),
  );
}

export function shouldScopeSampleRemindersToMerchant(
  context: TaskReminderAccessContext,
): boolean {
  const audiences = resolveTaskReminderAudiences(context);
  return audiences.has("merchant") && !audiences.has("admin") && !audiences.has("store");
}
