import { SmsNotificationsSettingsForm } from "@/components/molecules/sms-notifications-settings-form";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SmsNotificationsSettingsPage() {
  const context = await getCurrentUserContext();
  const canEdit = context ? hasPermission(context, "settings.sms_portal") : false;

  return (
    <div className="space-y-6">
      <SmsNotificationsSettingsForm canEdit={canEdit} />
    </div>
  );
}
