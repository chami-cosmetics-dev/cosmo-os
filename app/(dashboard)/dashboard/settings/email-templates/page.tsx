import Link from "next/link";
import { redirect } from "next/navigation";

import {
  EmailTemplatesSettingsForm,
  type EmailTemplateDto,
} from "@/components/molecules/email-templates-settings-form";
import { ErpSyncFailureEmailSettingsForm } from "@/components/molecules/erp-sync-failure-email-settings-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BUILTIN_EMAIL_TEMPLATES } from "@/lib/email-templates/catalog";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { ChevronLeft, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

function mergeTemplates(
  stored: Array<{
    id: string;
    key: string;
    name: string;
    subject: string;
    bodyHtml: string;
    recipients: string;
    ccRecipients: string;
  }>,
): EmailTemplateDto[] {
  const byKey = new Map(stored.map((t) => [t.key, t]));
  const out: EmailTemplateDto[] = [];

  for (const builtin of BUILTIN_EMAIL_TEMPLATES) {
    const row = byKey.get(builtin.key);
    out.push({
      id: row?.id ?? null,
      key: builtin.key,
      name: row?.name ?? builtin.name,
      subject: row?.subject ?? builtin.subject,
      bodyHtml: row?.bodyHtml ?? builtin.bodyHtml,
      recipients: row?.recipients ?? builtin.recipients,
      ccRecipients: row?.ccRecipients ?? builtin.ccRecipients,
      placeholders: builtin.placeholders,
      builtin: true,
      automated: Boolean(builtin.automated),
      saved: Boolean(row),
    });
    byKey.delete(builtin.key);
  }

  for (const row of byKey.values()) {
    out.push({
      id: row.id,
      key: row.key,
      name: row.name,
      subject: row.subject,
      bodyHtml: row.bodyHtml,
      recipients: row.recipients,
      ccRecipients: row.ccRecipients,
      placeholders: [],
      builtin: false,
      automated: false,
      saved: true,
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

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
          <CardHeader className="border-b border-border/50">
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Company settings are available to users with the appropriate permissions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  const canManageEmailTemplates = hasPermission(auth.context, "settings.email_templates");

  const companyId = auth.context!.user!.companyId;
  let initialTemplates: { templates: EmailTemplateDto[] } | null = null;

  if (companyId) {
    const templates = await prisma.emailTemplate.findMany({
      where: { companyId },
      select: {
        id: true,
        key: true,
        name: true,
        subject: true,
        bodyHtml: true,
        recipients: true,
        ccRecipients: true,
      },
    });
    initialTemplates = { templates: mergeTemplates(templates) };
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
          Multiple templates per company — edit subject, To, CC, and HTML. Built-in keys power
          automated reports; create custom keys for other mails.
        </p>
      </section>
      <EmailTemplatesSettingsForm
        canEdit={canManageEmailTemplates}
        initialTemplates={initialTemplates}
      />
      <ErpSyncFailureEmailSettingsForm canEdit={canManageEmailTemplates} />
    </div>
  );
}
