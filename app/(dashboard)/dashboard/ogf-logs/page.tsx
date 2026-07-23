import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { formatAppDateTimeShort } from "@/lib/format-datetime";
import { DailySalesSmsLogsPanel } from "@/components/organisms/daily-sales-sms-logs-panel";
import { OgfResendButton } from "./ogf-resend-button";

export const dynamic = "force-dynamic";

function formatColombo(date: Date | string) {
  return formatAppDateTimeShort(date);
}

function parseBatchDate(batchCode: string) {
  const dd = batchCode.slice(0, 2);
  const mm = batchCode.slice(2, 4);
  const yyyy = batchCode.slice(4, 8);
  return `${dd}/${mm}/${yyyy}`;
}

export default async function OgfLogsPage() {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const isOgfConfigured = Boolean(process.env.OGF_LOCATION_ID);
  const companyId = auth.context?.user?.companyId;

  const [logs, smsLogs] = companyId
    ? await Promise.all([
        prisma.ogfEmailLog.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        prisma.dailySalesSmsSendLog.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-6 shadow-[0_18px_40px_-28px_var(--primary)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Nightly notifications
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">OGF &amp; Daily Sales Logs</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
          OGF sync email history and daily sales SMS attempts. Use Resend on a failed row to retry
          without waiting for the next scheduled run.
        </p>
        {!isOgfConfigured && (
          <div className="mt-4 inline-flex rounded-lg border border-yellow-400/50 bg-yellow-50/80 px-4 py-2 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
            OGF_LOCATION_ID is not configured — OGF email sync runs only on the Cosmo OS deployment.
          </div>
        )}
      </section>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center justify-between">
            <CardTitle>OGF Email History</CardTitle>
            <span className="text-sm text-muted-foreground">
              {logs.length} record{logs.length !== 1 ? "s" : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No email logs yet. They will appear here after the next nightly OGF sync runs.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Sent At (Colombo)</th>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Orders</th>
                    <th className="px-4 py-3">Sent To</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Error</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-border/60 align-top hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatColombo(log.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{log.batchCode}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-foreground">
                        {parseBatchDate(log.batchCode)}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-foreground">
                        {log.orderCount}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{log.emailTo}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            log.source === "manual"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {log.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            log.status === "sent"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs text-xs text-red-600 dark:text-red-400">
                        {log.errorMessage ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <OgfResendButton batchCode={log.batchCode} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DailySalesSmsLogsPanel logs={smsLogs} />
    </div>
  );
}
