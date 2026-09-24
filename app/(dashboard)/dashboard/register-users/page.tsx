import { redirect } from "next/navigation";

import { RegisterUsersWorkbook } from "@/components/organisms/register-users-workbook";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function RegisterUsersPage() {
  const auth = await requirePermission("contacts.register");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  if (!auth.context!.user?.companyId) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Customer Care
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Register new users
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Set location and date range once, then add phones. Already-registered
          numbers load existing details. Header resets tomorrow.
        </p>
      </section>
      <RegisterUsersWorkbook />
    </div>
  );
}
