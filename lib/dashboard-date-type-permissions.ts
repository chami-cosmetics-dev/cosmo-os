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
    case "all_orders":
      return DASHBOARD_DATE_TYPE_PERMISSIONS.placedAll;
    case "not_delivered":
    case "bill_done_early":
    case "bill_open":
    case "done_after_delivery":
      return DASHBOARD_DATE_TYPE_PERMISSIONS.placedBreakdown;
    case "bill_done_in_dates":
    case "delivered_in_dates":
    case "bill_done_old":
    case "delivered_old":
    case "still_bill_open":
    case "still_not_delivered":
      return DASHBOARD_DATE_TYPE_PERMISSIONS.otherClocks;
  }
}

export function getAllowedDashboardDateTypes(permissionKeys: string[]) {
  const allowed: DashboardSalesDateType[] = [];
  if (permissionKeys.includes(DASHBOARD_DATE_TYPE_PERMISSIONS.placedAll)) {
    allowed.push("all_orders");
  }
  if (permissionKeys.includes(DASHBOARD_DATE_TYPE_PERMISSIONS.placedBreakdown)) {
    allowed.push(
      "not_delivered",
      "bill_done_early",
      "bill_open",
      "done_after_delivery",
    );
  }
  if (permissionKeys.includes(DASHBOARD_DATE_TYPE_PERMISSIONS.otherClocks)) {
    allowed.push(
      "bill_done_in_dates",
      "delivered_in_dates",
      "bill_done_old",
      "delivered_old",
      "still_bill_open",
      "still_not_delivered",
    );
  }
  return allowed;
}

export function getDefaultDashboardDateType(permissionKeys: string[]) {
  return getAllowedDashboardDateTypes(permissionKeys)[0] ?? null;
}
