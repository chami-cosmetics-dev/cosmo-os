import { Calculator } from "lucide-react";

import { KokoCompaniesSettingsForm } from "@/components/molecules/koko-companies-settings-form";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function KokoSettingsPage() {
  const context = await getCurrentUserContext();
  const canEdit = context ? hasPermission(context, "settings.company") : false;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Reports
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <Calculator className="size-5 text-muted-foreground" aria-hidden />
          Koko Settings
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Manage the predefined list of Koko companies and their invoice prefixes used in the Koko Tally tool.
        </p>
      </section>
      <KokoCompaniesSettingsForm canEdit={canEdit} />
    </div>
  );
}
