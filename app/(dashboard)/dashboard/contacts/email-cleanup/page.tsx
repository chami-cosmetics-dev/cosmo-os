import { redirect } from "next/navigation";

import { EmailCleanupPanel } from "@/app/(dashboard)/dashboard/contacts/email-cleanup/email-cleanup-panel";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ContactEmailCleanupPage() {
  const auth = await requireAnyPermission(["contacts.master.manage", "contacts.manage"]);
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <EmailCleanupPanel />
    </div>
  );
}
