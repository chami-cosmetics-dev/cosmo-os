import { redirect } from "next/navigation";

import { ContactAllocationPanel } from "@/components/organisms/contact-allocation-panel";
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

  return <ContactAllocationPanel />;
}
