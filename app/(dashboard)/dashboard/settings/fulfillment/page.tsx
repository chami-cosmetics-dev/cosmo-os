import { FulfillmentSettingsData } from "@/components/organisms/fulfillment-settings-data";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FulfillmentSettingsPage() {
  const context = await getCurrentUserContext();
  const canManageFulfillment = context
    ? hasPermission(context, "settings.fulfillment")
    : false;

  return (
    <div className="space-y-6">
      <FulfillmentSettingsData canEdit={canManageFulfillment} />
    </div>
  );
}
