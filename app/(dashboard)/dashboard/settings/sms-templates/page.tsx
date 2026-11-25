import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, MessageSquare } from "lucide-react";

import {
  SmsTemplatesSettingsForm,
  type SmsTemplateDto,
} from "@/components/molecules/sms-templates-settings-form";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission, requirePermission } from "@/lib/rbac";
import { getLoyaltySmsOfficePhone } from "@/lib/sms-templates/loyalty-sms-config";
import { mergeSmsTemplates } from "@/lib/sms-templates/merge";

export const dynamic = "force-dynamic";

export default async function SmsTemplatesSettingsPage() {
  const auth = await requirePermission("settings.sms_portal");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/api/auth/login");
    redirect("/dashboard/settings");
  }

  const context = await getCurrentUserContext();
  const canEdit = context ? hasPermission(context, "settings.sms_portal") : false;
  const companyId = context?.user?.companyId ?? null;

  let initialData:
    | {
        templates: SmsTemplateDto[];
        officeContactPhone: string;
      }
    | null
    | undefined = undefined;

  if (!companyId) {
    initialData = null;
  } else if (canEdit) {
    try {
      const [stored, officeContactPhone] = await Promise.all([
        prisma.smsTemplate.findMany({
          where: { companyId },
          select: {
            id: true,
            key: true,
            name: true,
            purpose: true,
            body: true,
            active: true,
          },
        }),
        getLoyaltySmsOfficePhone(companyId),
      ]);
      initialData = {
        templates: mergeSmsTemplates(stored),
        officeContactPhone,
      };
    } catch (e) {
      console.error("[sms-templates] Failed to load (run prisma migrate):", e);
      initialData = undefined;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/settings">
            <ChevronLeft className="size-4" aria-hidden />
            Settings
          </Link>
        </Button>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          COSMO OS / SMS Templates
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <MessageSquare className="size-5 text-muted-foreground" aria-hidden />
          SMS Templates
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Loyalty wish templates for Gold (10%) and Platinum (15%). Edit, save, and add
          variants — active templates for a tier are picked at random when a customer is
          upgraded.
        </p>
      </section>

      <SmsTemplatesSettingsForm canEdit={canEdit} initialData={initialData} />
    </div>
  );
}
