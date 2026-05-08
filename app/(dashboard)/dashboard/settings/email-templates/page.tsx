import Link from "next/link";
import { redirect } from "next/navigation";

import { EmailTemplatesSettingsForm } from "@/components/molecules/email-templates-settings-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { ChevronLeft, Mail } from "lucide-react";

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
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="hover:bg-secondary/10">
            <Link href="/dashboard/settings">
              <ChevronLeft className="size-4" aria-hidden />
              Settings
            </Link>
          </Button>
        </div>
        <Card className="overflow-hidden border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Company settings are available to users with the appropriate
              permissions. Contact your administrator to update company
              information.
            </p>
          </CardContent>
        </Card>
      </div>
    );
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
        <Button variant="ghost" size="sm" asChild className="hover:bg-secondary/10">
          <Link href="/dashboard/settings">
            <ChevronLeft className="size-4" aria-hidden />
            Settings
          </Link>
        </Button>
      </div>
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Communication
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <Mail className="size-5 text-muted-foreground" aria-hidden />
          Email Templates
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Manage notification subjects, recipients, and HTML content with a live preview before saving.
        </p>
      </section>
      <EmailTemplatesSettingsForm
        canEdit={canManageEmailTemplates}
        initialTemplates={initialTemplates}
      />
    </div>
  );
}
