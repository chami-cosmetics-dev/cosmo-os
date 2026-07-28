import type { DashboardSalesDateType } from "@/lib/page-data/dashboard-overview-shared";

export const DASHBOARD_DATE_TYPE_PERMISSIONS = {
  placedAll: "dashboard.date_type.placed_all",
  placedBreakdown: "dashboard.date_type.placed_breakdown",
  otherClocks: "dashboard.date_type.other_clocks",
} as const;

export const DASHBOARD_DATE_TYPE_PERMISSION_KEYS = Object.values(
  DASHBOARD_DATE_TYPE_PERMISSIONS,
);

export function getDashboardDateTypePermission(dateType: DashboardSalesDateType) {
  switch (dateType) {
    case "placed_all":
      return DASHBOARD_DATE_TYPE_PERMISSIONS.placedAll;
    case "placed_open":
    case "placed_pending_invoice":
    case "placed_invoice_completed":
      return DASHBOARD_DATE_TYPE_PERMISSIONS.placedBreakdown;
    case "closed_in_period":
    case "delivered_all":
    case "delivered_pending_invoice":
      return DASHBOARD_DATE_TYPE_PERMISSIONS.otherClocks;
  }
}

export function getAllowedDashboardDateTypes(permissionKeys: string[]) {
  const allowed: DashboardSalesDateType[] = [];
  if (permissionKeys.includes(DASHBOARD_DATE_TYPE_PERMISSIONS.placedAll)) {
    allowed.push("placed_all");
  }
  if (permissionKeys.includes(DASHBOARD_DATE_TYPE_PERMISSIONS.placedBreakdown)) {
    allowed.push("placed_open", "placed_pending_invoice", "placed_invoice_completed");
  }
  if (permissionKeys.includes(DASHBOARD_DATE_TYPE_PERMISSIONS.otherClocks)) {
    allowed.push("closed_in_period", "delivered_all", "delivered_pending_invoice");
  }
  return allowed;
}

export function getDefaultDashboardDateType(permissionKeys: string[]) {
  return getAllowedDashboardDateTypes(permissionKeys)[0] ?? null;
}
