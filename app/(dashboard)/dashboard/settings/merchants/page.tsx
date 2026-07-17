import { MerchantsSettingsClient } from "@/components/organisms/merchants-settings-client";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function MerchantsSettingsPage() {
  const auth = await requirePermission("outlets.manage");
  if (!auth.ok) {
    return <p className="text-sm text-destructive">{auth.error}</p>;
  }

  return <MerchantsSettingsClient />;
}
