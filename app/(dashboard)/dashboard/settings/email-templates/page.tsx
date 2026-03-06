import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Sparkles } from "lucide-react";

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
      <div className="rounded-xl border bg-card/95 p-5 shadow-sm sm:p-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
          <Mail className="size-3.5" aria-hidden />
          Template Center
        </div>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Email Templates</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure and maintain staff notification emails with reusable placeholders.
            </p>
          </div>
          <div className="rounded-lg border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
            <p className="inline-flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="size-4 text-sky-700" aria-hidden />
              Resignation notice is currently available
            </p>
            <p className="mt-1 text-xs">
              Add placeholders like <code>{"{{staffName}}"}</code> and <code>{"{{resignationDate}}"}</code>.
            </p>
          </div>
        </div>
      </div>
      <EmailTemplatesSettingsForm
        canEdit={canManageEmailTemplates}
        initialTemplates={initialTemplates}
      />
    </div>
  );
}
