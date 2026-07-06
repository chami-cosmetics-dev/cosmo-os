import type { TaskReminderCategory } from "@/lib/task-reminders";
import { hasReminderPermission } from "@/lib/task-reminders";

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
    hasReminderPermission(context, "finance.approvals.read")
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

function categoryPermission(category: TaskReminderCategory): string {
  switch (category) {
    case "erp_sync_warning":
      return "system.erp_sync.read";
    case "finance_approval":
      return "finance.approvals.manage";
    case "add_samples":
      return "fulfillment.sample_free_issue.read";
    case "print":
      return "fulfillment.order_print.read";
    case "ready_dispatch":
    case "rearrange_dispatch":
      return "fulfillment.ready_dispatch.read";
    case "return_action":
      return "returns.read";
    case "delivery_pending":
      return "fulfillment.delivery_invoice.read";
  }
}

function hasFinanceReminderPermission(context: TaskReminderAccessContext) {
  return (
    hasReminderPermission(context, "finance.approvals.manage") ||
    hasReminderPermission(context, "finance.approvals.read")
  );
}

function categoryAudience(category: TaskReminderCategory): TaskReminderAudience {
  switch (category) {
    case "erp_sync_warning":
      return "admin";
    case "finance_approval":
      return "finance";
    case "add_samples":
      return "merchant";
    case "print":
    case "ready_dispatch":
    case "rearrange_dispatch":
    case "delivery_pending":
    case "return_action":
      return "store";
  }
}

export function canSeeTaskReminderCategory(
  context: TaskReminderAccessContext,
  category: TaskReminderCategory,
): boolean {
  const audiences = resolveTaskReminderAudiences(context);

  if (audiences.has("admin")) {
    return category === "finance_approval"
      ? hasFinanceReminderPermission(context)
      : hasReminderPermission(context, categoryPermission(category));
  }

  if (audiences.size === 1 && audiences.has("finance")) {
    return category === "finance_approval" && hasFinanceReminderPermission(context);
  }

  if (audiences.size === 1 && audiences.has("merchant")) {
    return (
      category === "add_samples" &&
      hasReminderPermission(context, "fulfillment.sample_free_issue.read")
    );
  }

  if (audiences.size === 1 && audiences.has("store")) {
    if (category === "finance_approval" || category === "add_samples") return false;
    return hasReminderPermission(context, categoryPermission(category));
  }

  return (
    audiences.has(categoryAudience(category)) &&
    (category === "finance_approval"
      ? hasFinanceReminderPermission(context)
      : hasReminderPermission(context, categoryPermission(category)))
  );
}

const ALL_TASK_REMINDER_CATEGORIES = [
  "erp_sync_warning",
  "finance_approval",
  "add_samples",
  "print",
  "ready_dispatch",
  "rearrange_dispatch",
  "delivery_pending",
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
