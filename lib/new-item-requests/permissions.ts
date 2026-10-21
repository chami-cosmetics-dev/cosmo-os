import { hasPermission } from "@/lib/rbac";

export const NEW_ITEM_REQUESTS_PERMISSIONS = {
  manage: "new_item_requests.manage",
  admin: "new_item_requests.admin",
} as const;

export const NEW_ITEM_REQUESTS_ANY_PERMISSION = [
  NEW_ITEM_REQUESTS_PERMISSIONS.manage,
  NEW_ITEM_REQUESTS_PERMISSIONS.admin,
] as const;

type UserContext = Parameters<typeof hasPermission>[0];

export function canAdminNewItemRequests(context: UserContext) {
  return hasPermission(context, NEW_ITEM_REQUESTS_PERMISSIONS.admin);
}

export function canManageNewItemRequests(context: UserContext) {
  return (
    canAdminNewItemRequests(context) ||
    hasPermission(context, NEW_ITEM_REQUESTS_PERMISSIONS.manage)
  );
}
