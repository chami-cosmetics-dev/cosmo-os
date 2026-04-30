import { redirect } from "next/navigation";

import { ComplaintsPanel } from "@/components/organisms/complaints-panel";
import { fetchComplaints } from "@/lib/page-data/complaints";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ComplaintsPage() {
  const auth = await requireAnyPermission(["complaints.create", "complaints.read", "complaints.manage"]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard");
  }

  const companyId = auth.context.user?.companyId ?? null;
  const userId = auth.context.user?.id ?? null;
  if (!companyId || !userId) {
    redirect("/dashboard");
  }

  const canCreate = hasPermission(auth.context, "complaints.create") || hasPermission(auth.context, "complaints.manage");
  const canManage = hasPermission(auth.context, "complaints.manage");
  const canReadAll = hasPermission(auth.context, "complaints.read") || canManage;
  const complaints = await fetchComplaints({
    companyId,
    userId,
    canReadAll,
    status: "all",
    limit: 100,
  });

  return (
    <ComplaintsPanel
      initialComplaints={complaints}
      canCreate={canCreate}
      canManage={canManage}
      canReadAll={canReadAll}
    />
  );
}
