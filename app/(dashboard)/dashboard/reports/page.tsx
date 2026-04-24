import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { DumpReportsPanel } from "@/components/organisms/dump-reports-panel";
import { requirePermission } from "@/lib/rbac";

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
  const auth = await requirePermission("orders.read");
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

  return <DumpReportsPanel historicalYears={getHistoricalYears()} />;
}
