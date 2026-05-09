import { SmsNotificationsSettingsForm } from "@/components/molecules/sms-notifications-settings-form";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SmsNotificationsSettingsPage() {
  const context = await getCurrentUserContext();
  const canEdit = context ? hasPermission(context, "settings.sms_portal") : false;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Communication
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <MessageSquare className="size-5 text-muted-foreground" aria-hidden />
          SMS Notifications
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Control order-stage SMS templates, recipient rules, and trigger behavior from one place.
        </p>
      </section>
      <SmsNotificationsSettingsForm canEdit={canEdit} />
    </div>
  );
}
