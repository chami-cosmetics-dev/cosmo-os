import Link from "next/link";
import { redirect } from "next/navigation";

import { ErpInstancesSettingsForm } from "@/components/molecules/erp-instances-settings-form";
import { Button } from "@/components/ui/button";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ErpInstancesSettingsPage() {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard/settings");
  }
  const canEdit = hasPermission(auth.context, "settings.company");

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
      <ErpInstancesSettingsForm canEdit={canEdit} />
    </div>
  );
}
