import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { OgfLogsPageClient } from "@/components/organisms/ogf-logs-page-client";
import {
  clampPage,
  NIGHTLY_LOGS_DEFAULT_LIMIT,
  type DailySalesSmsLogDto,
  type NightlyLogsPagination,
  type OgfEmailLogDto,
} from "@/lib/nightly-logs";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

async function loadOgfPage(companyId: string): Promise<{
  logs: OgfEmailLogDto[];
  pagination: NightlyLogsPagination;
}> {
  const limit = NIGHTLY_LOGS_DEFAULT_LIMIT;
  const total = await prisma.ogfEmailLog.count({ where: { companyId } });
  const page = clampPage(1, limit, total);
  const rows = await prisma.ogfEmailLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
  return {
    logs: rows.map((row) => ({
      id: row.id,
      batchCode: row.batchCode,
      orderCount: row.orderCount,
      emailTo: row.emailTo,
      status: row.status,
      errorMessage: row.errorMessage,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
    })),
    pagination: { page, limit, total },
  };
}

async function loadSmsPage(companyId: string): Promise<{
  logs: DailySalesSmsLogDto[];
  pagination: NightlyLogsPagination;
}> {
  const limit = NIGHTLY_LOGS_DEFAULT_LIMIT;
  const total = await prisma.dailySalesSmsSendLog.count({ where: { companyId } });
  const page = clampPage(1, limit, total);
  const rows = await prisma.dailySalesSmsSendLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
  return {
    logs: rows.map((row) => ({
      id: row.id,
      reportDate: row.reportDate,
      status: row.status,
      source: row.source,
      errorSummary: row.errorSummary,
      recipients: row.recipients,
      recipientCount: row.recipientCount,
      createdAt: row.createdAt.toISOString(),
    })),
    pagination: { page, limit, total },
  };
}

export default async function OgfLogsPage() {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const isOgfConfigured = Boolean(process.env.OGF_LOCATION_ID);
  const companyId = auth.context?.user?.companyId;

  const [ogf, sms] = companyId
    ? await Promise.all([loadOgfPage(companyId), loadSmsPage(companyId)])
    : [
        {
          logs: [] as OgfEmailLogDto[],
          pagination: {
            page: 1,
            limit: NIGHTLY_LOGS_DEFAULT_LIMIT,
            total: 0,
          },
        },
        {
          logs: [] as DailySalesSmsLogDto[],
          pagination: {
            page: 1,
            limit: NIGHTLY_LOGS_DEFAULT_LIMIT,
            total: 0,
          },
        },
      ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-6 shadow-[0_18px_40px_-28px_var(--primary)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Nightly notifications
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">OGF &amp; Daily Sales Logs</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
          Review OGF email and daily sales SMS history in separate tabs. Use Resend on a failed
          row, or Send for date on the SMS tab when a day was missed.
        </p>
      </section>

      <OgfLogsPageClient
        ogfConfigured={isOgfConfigured}
        ogfLogs={ogf.logs}
        ogfPagination={ogf.pagination}
        smsLogs={sms.logs}
        smsPagination={sms.pagination}
      />
    </div>
  );
}
