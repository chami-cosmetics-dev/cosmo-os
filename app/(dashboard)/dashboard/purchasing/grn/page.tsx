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

  return <GrnPanel />;
}
