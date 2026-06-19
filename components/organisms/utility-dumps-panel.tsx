"use client";

import { Download, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { REPORT_DUMP_PERMISSIONS } from "@/lib/report-permissions";

type UtilityDumpsPanelProps = {
  permissionKeys: string[];
  roleNames?: string[];
};

type ReportAction = {
  href: string;
  label: string;
  permission: string;
};

function ReportRow({ title, subtitle, action }: { title: string; subtitle: string; action: ReportAction }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <Button asChild className="bg-sky-500 text-white hover:bg-sky-600">
        <a href={action.href}>
          <Download className="mr-2 size-4" />
          {action.label}
        </a>
      </Button>
    </div>
  );
}

export function UtilityDumpsPanel({ permissionKeys, roleNames = [] }: UtilityDumpsPanelProps) {
  const can = (permission: string) =>
    roleNames.includes("super_admin") ||
    roleNames.includes("admin") ||
    permissionKeys.includes(permission);
  const actions: ReportAction[] = [
    {
      href: "/api/admin/reports/orders?report=invoice&range=last-90&omit_customer_phone=1",
      label: "Dump 2",
      permission: REPORT_DUMP_PERMISSIONS.utilityInvoice90,
    },
    {
      href: "/api/admin/reports/orders?report=invoice-item&range=last-90&omit_customer_phone=1",
      label: "Dump 3",
      permission: REPORT_DUMP_PERMISSIONS.utilityInvoiceItem90,
    },
  ].filter((action) => can(action.permission));
  const dump2Action = actions.find((action) => action.label === "Dump 2");
  const dump3Action = actions.find((action) => action.label === "Dump 3");

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-6 shadow-[0_18px_40px_-28px_var(--primary)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reporting Hub</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Utility Dumps</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
          Utility exports for invoice and item-level order dumps.
        </p>
      </section>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),transparent)]">
          <CardTitle className="flex items-center gap-2 text-sky-800 dark:text-sky-200">
            <FileText className="size-5" />
            Available Dumps
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          {dump2Action && (
            <ReportRow
              title="Web-site Invoice Detail (Invoice Wise) [Last 90 Days]"
              subtitle="Invoice-wise website and manual order export for the last 90 days."
              action={dump2Action}
            />
          )}
          {dump3Action && (
            <ReportRow
              title="Web-site Invoice Item Detail (Invoice/Item Wise) [Last 90 Days]"
              subtitle="Line-item level export for the last 90 days."
              action={dump3Action}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
