import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { KokoTallyPanel } from "@/components/organisms/koko-tally-panel";
import { REPORT_DUMP_PERMISSIONS } from "@/lib/report-permissions";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function KokoTallyPage() {
  const auth = await requirePermission(REPORT_DUMP_PERMISSIONS.invoice90);
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }
    return <PermissionDeniedCard />;
  }

  return <KokoTallyPanel />;
}
