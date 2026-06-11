import { redirect } from "next/navigation";

import { OutletsSettingsClient } from "@/components/organisms/outlets-settings-client";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OutletsSettingsPage() {
  const auth = await requirePermission("outlets.manage");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  return <OutletsSettingsClient />;
}
