"use client";

import { Database, Download, History, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DumpReportsPanelProps = {
  historicalYears: number[];
};

type ReportAction = {
  href: string;
  label: string;
  tone?: "emerald" | "sky" | "amber";
};

function toneClass(tone?: ReportAction["tone"]) {
  if (tone === "amber") return "bg-amber-500 hover:bg-amber-600";
  if (tone === "sky") return "bg-sky-500 hover:bg-sky-600";
  return "bg-emerald-500 hover:bg-emerald-600";
}

function ReportRow({ title, subtitle, actions }: { title: string; subtitle: string; actions: ReportAction[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button key={action.href} asChild className={`text-white ${toneClass(action.tone)}`}>
            <a href={action.href}>
              <Download className="mr-2 size-4" />
              {action.label}
            </a>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function DumpReportsPanel({ historicalYears }: DumpReportsPanelProps) {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-6 shadow-[0_18px_40px_-28px_var(--primary)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reporting Hub</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Dump Reports</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
          Live export panel for contact and website invoice dumps, including current-period, warehouse, and historical year-wise files.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-white/40 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Real-time Reports</p>
              <p className="mt-2 text-2xl font-semibold">6+</p>
            </CardContent>
          </Card>
          <Card className="border-white/40 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Warehouse Dumps</p>
              <p className="mt-2 text-2xl font-semibold">2</p>
            </CardContent>
          </Card>
          <Card className="border-white/40 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Historical Years</p>
              <p className="mt-2 text-2xl font-semibold">{historicalYears.length}</p>
            </CardContent>
          </Card>
          <Card className="border-white/40 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Export Format</p>
              <p className="mt-2 text-2xl font-semibold">CSV</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="overflow-hidden border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),transparent)]">
            <CardTitle className="flex items-center gap-2 text-sky-800 dark:text-sky-200">
              <Sparkles className="size-5" />
              Real-time Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <ReportRow
              title="Contact Number List with details"
              subtitle="Live export from the current Contact Master records with the same sample column headers."
              actions={[
                { href: "/api/admin/reports/contact-dump?part=1", label: "Dump 1 (Part 1)", tone: "emerald" },
                { href: "/api/admin/reports/contact-dump?part=1_1", label: "Dump 1 (Part 1_1)", tone: "emerald" },
                { href: "/api/admin/reports/contact-dump?part=2", label: "Dump 1 (Part 2)", tone: "emerald" },
              ]}
            />
            <ReportRow
              title="Web-site Invoice Detail (Invoice Wise) [Last 90 Days]"
              subtitle="Invoice-wise website and manual order export for the last 90 days."
              actions={[{ href: "/api/admin/reports/orders?report=invoice&range=last-90", label: "Dump 2", tone: "sky" }]}
            />
            <ReportRow
              title="Web-site Invoice Item Detail (Invoice/Item Wise) [Last 90 Days]"
              subtitle="Line-item level export for the last 90 days."
              actions={[{ href: "/api/admin/reports/orders?report=invoice-item&range=last-90", label: "Dump 3", tone: "sky" }]}
            />
            <ReportRow
              title="Contact Number with Last Purchased Date"
              subtitle="Simple contact list with latest purchase date and recent merchant."
              actions={[{ href: "/api/admin/reports/contacts?report=last-purchased", label: "Dump 4", tone: "sky" }]}
            />
            <ReportRow
              title="Contact Number Log Details"
              subtitle="Contact creation and update log with latest purchase date."
              actions={[{ href: "/api/admin/reports/contacts?report=log", label: "Dump 5", tone: "sky" }]}
            />
            <ReportRow
              title="Loyalty Customer List"
              subtitle="Contacts with recorded purchases, exported as a loyalty-oriented list."
              actions={[{ href: "/api/admin/reports/contacts?report=loyalty", label: "Loyalty Customers", tone: "amber" }]}
            />
            <ReportRow
              title="Full contact dump"
              subtitle="Download all available contact records in one file."
              actions={[{ href: "/api/admin/reports/contact-dump?part=all", label: "Download All", tone: "sky" }]}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,rgba(245,158,11,0.10),transparent)]">
              <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <Database className="size-5" />
                Warehoused Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <ReportRow
                title="Web-site Invoice Detail (Invoice Wise 360 Days) [Processed Up to Last Day]"
                subtitle="Invoice-wise warehouse export for the last 360 days ending yesterday."
                actions={[{ href: "/api/admin/reports/orders?report=invoice&range=warehouse-360", label: "Dump 1", tone: "sky" }]}
              />
              <ReportRow
                title="Web-site Invoice Item Detail (Invoice Wise) [Processed Up to Last Day]"
                subtitle="Invoice item warehouse export for the last 360 days ending yesterday."
                actions={[{ href: "/api/admin/reports/orders?report=invoice-item&range=warehouse-360", label: "Dump 3", tone: "sky" }]}
              />
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,rgba(251,191,36,0.10),transparent)]">
              <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <History className="size-5" />
                All-time Historical Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {historicalYears.map((year) => (
                <div key={year} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/80 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <p className="font-medium text-foreground">Data {year}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild className="bg-sky-500 text-white hover:bg-sky-600">
                      <a href={`/api/admin/reports/orders?report=invoice-item&range=historical-year&year=${year}`}>
                        <Download className="mr-2 size-4" />
                        Invoice Item Details
                      </a>
                    </Button>
                    <Button asChild className="bg-amber-500 text-white hover:bg-amber-600">
                      <a href={`/api/admin/reports/orders?report=invoice&range=historical-year&year=${year}`}>
                        <Download className="mr-2 size-4" />
                        Invoice Details
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                Historical files use calendar-year ranges, and invoice exports are generated directly from current live order records.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
