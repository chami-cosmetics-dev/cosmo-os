import { SmsNotificationsSettingsForm } from "@/components/molecules/sms-notifications-settings-form";
import { MessageSquareText, Zap } from "lucide-react";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SmsNotificationsSettingsPage() {
  const context = await getCurrentUserContext();
  const canEdit = context ? hasPermission(context, "settings.sms_portal") : false;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card/95 p-5 shadow-sm sm:p-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300">
          <MessageSquareText className="size-3.5" aria-hidden />
          Messaging Rules
        </div>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">SMS Notifications</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure trigger-based SMS delivery for order lifecycle updates.
            </p>
          </div>
          <div className="rounded-lg border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
            <p className="inline-flex items-center gap-2 font-medium text-foreground">
              <Zap className="size-4 text-cyan-700" aria-hidden />
              One configuration card per lifecycle event
            </p>
            <p className="mt-1 text-xs">
              Enable only the alerts your operations team needs.
            </p>
          </div>
        </div>
      </div>
      <SmsNotificationsSettingsForm canEdit={canEdit} />
    </div>
  );
}
