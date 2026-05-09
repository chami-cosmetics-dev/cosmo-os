import { redirect } from "next/navigation";

import { ContactsPanel } from "@/components/organisms/contacts-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { fetchContactsPageData } from "@/lib/page-data/contacts";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return <PermissionDeniedCard />;
  }

  const initialData = await fetchContactsPageData(companyId, {
    page: 1,
    limit: 10,
    sortOrder: "desc",
  });

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Customer Care
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Contacts
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Track customer records, purchase activity, and contact history from one searchable workspace.
        </p>
      </section>
      <ContactsPanel initialData={initialData} canManage={auth.context!.permissionKeys.includes("orders.manage")} />
    </div>
  );
}
