import Link from "next/link";
import { redirect } from "next/navigation";

import { EmailTemplatesSettingsForm } from "@/components/molecules/email-templates-settings-form";
import { Button } from "@/components/ui/button";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EmailTemplatesSettingsPage() {
  const auth = await requirePermission("settings.email_templates");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard/settings");
  }
  const canManageEmailTemplates = hasPermission(auth.context, "settings.email_templates");

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
      <EmailTemplatesSettingsForm canEdit={canManageEmailTemplates} />
    </div>
  );
}
