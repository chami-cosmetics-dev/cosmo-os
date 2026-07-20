import type { TaskReminderCategory } from "@/lib/task-reminders";
import { hasReminderPermission } from "@/lib/task-reminders";
import {
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

/** Hard caps for named audiences — reminders.* cannot exceed these. */
const FINANCE_REMINDER_CATEGORIES = new Set<TaskReminderCategory>([
  "finance_approval",
  "invoice_complete",
]);

const MERCHANT_REMINDER_CATEGORIES = new Set<TaskReminderCategory>(["add_samples"]);

const STORE_REMINDER_CATEGORIES = new Set<TaskReminderCategory>([
  "print",
  "ready_dispatch",
  "rearrange_dispatch",
  "delivery_pending",
  "invoice_complete",
  "return_action",
  "erp_sync_warning",
]);

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
 * Audience heuristics for role-type caps and merchant sample scoping.
 * Bubble visibility requires explicit reminders.*; then capped by audience.
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

function categoriesAllowedForAudience(
  audiences: Set<TaskReminderAudience>,
): Set<TaskReminderCategory> | null {
  if (audiences.has("admin")) return null; // unrestricted
  if (audiences.size === 1 && audiences.has("finance")) return FINANCE_REMINDER_CATEGORIES;
  if (audiences.size === 1 && audiences.has("merchant")) return MERCHANT_REMINDER_CATEGORIES;
  if (audiences.size === 1 && audiences.has("store")) return STORE_REMINDER_CATEGORIES;
  return null;
}

/**
 * Show a bubble only when the user has an explicit reminders.* grant —
 * then apply named-role caps so finance/store/merchant cannot see bubbles
 * outside their role type (even with reminders.* ticked).
 *
 * Uses permissionKeys directly (not hasReminderPermission) so admin/super_admin
 * also require a manual reminders.* tick.
 */
export function canSeeTaskReminderCategory(
  context: TaskReminderAccessContext,
  category: TaskReminderCategory,
): boolean {
  const reminderKey = reminderPermissionForCategory(
    category as ReminderBubbleCategory,
  );
  if (!context.permissionKeys.includes(reminderKey)) {
    return false;
  }

  const audiences = resolveTaskReminderAudiences(context);
  const allowed = categoriesAllowedForAudience(audiences);

  // Admin (or uncapped): any granted reminder key
  if (allowed === null && audiences.has("admin")) {
    return true;
  }

  // Named finance / store / merchant: hard cap to role categories
  if (allowed) {
    return allowed.has(category);
  }

  // Custom roles with no named audience: explicit reminders.* only
  return true;
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
