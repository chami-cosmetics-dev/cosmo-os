import Link from "next/link";
import { BookUser, ChevronLeft } from "lucide-react";

import { ContactAllocationOptionsSettingsForm } from "@/components/molecules/contact-allocation-options-settings-form";
import { Button } from "@/components/ui/button";
import { hasPermission, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ContactAllocationSettingsPage() {
  const auth = await requirePermission("contacts.allocation.settings");
  const canEdit = hasPermission(auth.context!, "contacts.allocation.settings");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/settings">
            <ChevronLeft className="size-4" aria-hidden />
            Settings
          </Link>
        </Button>
      </div>
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Operations
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <BookUser className="size-5 text-muted-foreground" aria-hidden />
          Contact Allocation Options
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Manage the predefined dropdown options used in the Contact Allocation panel — service providers, districts, towns, origins, customer types, and categories.
        </p>
      </section>
      <ContactAllocationOptionsSettingsForm canEdit={canEdit} />
    </div>
  );
}
