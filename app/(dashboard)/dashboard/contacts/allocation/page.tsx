import { redirect } from "next/navigation";

import { ContactAllocationPanel } from "@/components/organisms/contact-allocation-panel";
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

  const initialData = await fetchContactsPageData(companyId, {
    page: 1,
    limit: 24,
    sortOrder: "desc",
  });

  return (
    <ContactAllocationPanel
      initialData={initialData}
      canManage={auth.context!.permissionKeys.includes("orders.manage")}
    />
  );
}
