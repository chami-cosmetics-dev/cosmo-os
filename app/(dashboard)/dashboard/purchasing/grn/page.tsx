import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { GrnPanel } from "@/components/organisms/grn-panel";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function GrnPage() {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  if (!hasPermission(context, "purchasing.grn.read")) {
    return <PermissionDeniedCard />;
  }

  return (
    <GrnPanel
      permissions={{
        canMatchSsr: hasPermission(context, "purchasing.grn.match_ssr"),
        canViewHandover:
          hasPermission(context, "purchasing.grn.view_handover") ||
          hasPermission(context, "purchasing.grn.mark_handover"),
        canMarkHandover: hasPermission(context, "purchasing.grn.mark_handover"),
        canViewValued:
          hasPermission(context, "purchasing.grn.view_valued") ||
          hasPermission(context, "purchasing.grn.mark_valued"),
        canMarkValued: hasPermission(context, "purchasing.grn.mark_valued"),
        canViewReceived:
          hasPermission(context, "purchasing.grn.view_received") ||
          hasPermission(context, "purchasing.grn.mark_received"),
        canMarkReceived: hasPermission(context, "purchasing.grn.mark_received"),
      }}
    />
  );
}

