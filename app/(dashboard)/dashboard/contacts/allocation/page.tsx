import { redirect } from "next/navigation";

import { ContactAllocationPanel } from "@/components/organisms/contact-allocation-panel";
import { fetchContactFollowUps, fetchContactsNotUpdated } from "@/lib/page-data/contact-follow-ups";
import { fetchContactsPageData } from "@/lib/page-data/contacts";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ContactAllocationPage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }
    redirect("/dashboard");
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    redirect("/dashboard");
  }

  const canManage = auth.context!.permissionKeys.includes("orders.manage");
  const [initialData, followUps, notUpdatedQueue] = await Promise.all([
    fetchContactsPageData(companyId, {
      page: 1,
      limit: 24,
      sortOrder: "desc",
    }),
    fetchContactFollowUps({
      companyId,
      merchantName: canManage ? null : auth.context!.user?.name,
      merchantEmail: canManage ? null : auth.context!.user?.email,
      limit: 30,
    }),
    fetchContactsNotUpdated({
      companyId,
      merchantName: canManage ? null : auth.context!.user?.name,
      merchantEmail: canManage ? null : auth.context!.user?.email,
      limit: 30,
    }),
  ]);

  return (
    <ContactAllocationPanel
      initialData={initialData}
      initialFollowUps={followUps}
      initialNotUpdatedQueue={notUpdatedQueue}
      canManage={canManage}
    />
  );
}
