import { redirect } from "next/navigation";

import { ConsultationInsightsPanel } from "@/components/organisms/consultation-insights-panel";
import { getConsultationAccess } from "@/lib/consultation-insights/auth";
import { listConsultations } from "@/lib/consultation-insights/server";
import { currentConsultationMonth } from "@/lib/consultation-insights/shared";

export const dynamic = "force-dynamic";

// Not nested under /contacts on purpose: the sidebar entry can move to Reports without a URL change.
export default async function ConsultationInsightsPage() {
  const access = await getConsultationAccess();
  if (!access.ok) {
    if (access.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const month = currentConsultationMonth();
  const rows = await listConsultations(access.companyId, month);

  return <ConsultationInsightsPanel initialMonth={month} initialRows={rows} />;
}
