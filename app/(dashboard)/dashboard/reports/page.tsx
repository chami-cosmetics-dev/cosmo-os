import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { DumpReportsPanel } from "@/components/organisms/dump-reports-panel";
import { fetchRecentReportDownloadLogs } from "@/lib/report-download-log";
import { ALL_REPORT_DUMP_PERMISSIONS, REPORT_DUMP_PERMISSIONS } from "@/lib/report-permissions";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function getHistoricalYears() {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = 2019; year <= currentYear; year += 1) {
    years.push(year);
  }
  return years;
}

export default async function ReportsPage() {
  const auth = await requireAnyPermission(ALL_REPORT_DUMP_PERMISSIONS);
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return <PermissionDeniedCard />;
  }

  const recentLogs = await fetchRecentReportDownloadLogs(companyId, 12);
  const roleNames = auth.context.roleNames ?? [];
  const isAdmin = roleNames.includes("admin") || roleNames.includes("super_admin");
  const permissionKeys = isAdmin
    ? Array.from(new Set([...auth.context.permissionKeys, REPORT_DUMP_PERMISSIONS.master]))
    : auth.context.permissionKeys;

  return (
    <DumpReportsPanel
      historicalYears={getHistoricalYears()}
      permissionKeys={permissionKeys}
      recentLogs={recentLogs}
    />
  );
}
