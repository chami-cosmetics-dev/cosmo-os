import type { TaskReminderCategory } from "@/lib/task-reminders";
import { hasReminderPermission } from "@/lib/task-reminders";

export type TaskReminderAudience = "admin" | "finance" | "merchant" | "store";

export type TaskReminderAccessContext = {
  permissionKeys: string[];
  roleNames: string[];
  userId?: string;
};

const OPS_ADMIN_ROLES = new Set(["super_admin", "admin", "manager"]);
const FINANCE_ROLES = new Set(["finance", "hod"]);

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
  const audiences = new Set<TaskReminderAudience>();
  const { roleNames, permissionKeys } = context;

  if (roleNames.some((role) => OPS_ADMIN_ROLES.has(role))) {
    audiences.add("admin");
    return audiences;
  }

  if (roleNames.some((role) => FINANCE_ROLES.has(role))) {
    audiences.add("finance");
  } else if (
    hasReminderPermission(context, "finance.approvals.manage") &&
    !hasStoreFulfillmentAccess(permissionKeys) &&
    !hasSampleFulfillmentAccess(permissionKeys)
  ) {
    audiences.add("finance");
  }

  if (isStoreRoleName(roleNames) || hasStoreFulfillmentAccess(permissionKeys)) {
    audiences.add("store");
  }

  if (
    isMerchantRoleName(roleNames) ||
    (hasSampleFulfillmentAccess(permissionKeys) &&
      !hasStoreFulfillmentAccess(permissionKeys))
  ) {
    audiences.add("merchant");
  }

  return audiences;
}

function categoryPermission(category: TaskReminderCategory): string {
  switch (category) {
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

function categoryAudience(category: TaskReminderCategory): TaskReminderAudience {
  switch (category) {
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
  if (!hasReminderPermission(context, categoryPermission(category))) {
    return false;
  }

  const audiences = resolveTaskReminderAudiences(context);
  if (audiences.has("admin")) return true;
  return audiences.has(categoryAudience(category));
}

export function shouldScopeSampleRemindersToMerchant(
  context: TaskReminderAccessContext,
): boolean {
  const audiences = resolveTaskReminderAudiences(context);
  return audiences.has("merchant") && !audiences.has("admin") && !audiences.has("store");
}
