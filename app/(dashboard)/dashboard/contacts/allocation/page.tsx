import { redirect } from "next/navigation";

import { ContactAllocationPanel } from "@/components/organisms/contact-allocation-panel";
import { fetchContactAllocationPageData } from "@/lib/page-data/contact-allocation";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ContactAllocationPage() {
  const auth = await requireAnyPermission(["contacts.allocation.read", "contacts.read"]);
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

  const initialData = await fetchContactAllocationPageData(companyId);
  const canManage =
    hasPermission(auth.context!, "contacts.allocation.manage") ||
    hasPermission(auth.context!, "contacts.manage");

  return <ContactAllocationPanel initialData={initialData} canManage={canManage} />;
}
