import Link from "next/link";
import { redirect } from "next/navigation";

import { EmailTemplatesSettingsForm } from "@/components/molecules/email-templates-settings-form";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { ChevronLeft } from "lucide-react";

const RESIGNATION_DEFAULT = {
  key: "resignation_notice",
  name: "Resignation Notice",
  subject: "Staff Resignation: {{staffName}}",
  bodyHtml: `<p>This is to inform you that the following staff member has resigned and the offboarding process has been completed.</p>
<ul>
<li><strong>Name:</strong> {{staffName}}</li>
<li><strong>Resignation date:</strong> {{resignationDate}}</li>
<li><strong>Reason:</strong> {{reason}}</li>
<li><strong>Employee number:</strong> {{employeeNumber}}</li>
<li><strong>Department:</strong> {{department}}</li>
<li><strong>Designation:</strong> {{designation}}</li>
<li><strong>Location:</strong> {{location}}</li>
</ul>`,
  recipients: "",
};

export const dynamic = "force-dynamic";

export default async function EmailTemplatesSettingsPage() {
  const auth = await requirePermission("settings.email_templates");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/dashboard/settings");
  }
  const canManageEmailTemplates = hasPermission(auth.context, "settings.email_templates");

  const companyId = auth.context!.user!.companyId;
  let initialTemplates: { resignation_notice: { id: string | null; key: string; name: string; subject: string; bodyHtml: string; recipients: string } } | null = null;

  if (companyId) {
    const templates = await prisma.emailTemplate.findMany({
      where: { companyId },
      select: { id: true, key: true, name: true, subject: true, bodyHtml: true, recipients: true },
    });
    const resignation = templates.find((t) => t.key === "resignation_notice");
    initialTemplates = {
      resignation_notice: resignation ?? { ...RESIGNATION_DEFAULT, id: null },
    };
  }

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
      <EmailTemplatesSettingsForm
        canEdit={canManageEmailTemplates}
        initialTemplates={initialTemplates}
      />
    </div>
  );
}
