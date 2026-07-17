import { redirect } from "next/navigation";
import Link from "next/link";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { DailySalesSmsSendForDate } from "@/components/molecules/daily-sales-sms-send-for-date";
import { DailySalesSmsLogsPanel } from "@/components/organisms/daily-sales-sms-logs-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDailySalesSmsConfig } from "@/lib/daily-sales-sms";
import { buildDailySalesSmsStatusSummary } from "@/lib/daily-sales-sms-status";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function formatColombo(date: Date | string) {
  return new Date(date).toLocaleString("en-GB", {
    timeZone: "Asia/Colombo",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SalesSmsLogsPage() {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context?.user?.companyId;
  const [config, smsLogs] = companyId
    ? await Promise.all([
        getDailySalesSmsConfig(companyId),
        prisma.dailySalesSmsSendLog.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ])
    : [null, []];

  const status = buildDailySalesSmsStatusSummary({
    enabled: config?.enabled,
    recipients: config?.recipients,
    lastLog: smsLogs[0] ?? null,
  });

  const blockerHints: string[] = [];
  if (!status.enabled) {
    blockerHints.push("Daily Sales SMS is disabled — enable it under Settings → SMS Portal.");
  } else if (status.recipientCount === 0) {
    blockerHints.push("No recipients configured — add phone numbers under Settings → SMS Portal.");
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-6 shadow-[0_18px_40px_-28px_var(--primary)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Daily sales notifications
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sales SMS Logs</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
          Daily sales SMS attempts for this company. Use Send for date when the scheduled run
          missed a day, or Resend on a log row to retry.
        </p>
      </section>

      <Card className="border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50">
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Enabled
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {status.enabled ? (
                  <span className="text-emerald-700 dark:text-emerald-300">Yes</span>
                ) : (
                  <span className="text-amber-800 dark:text-amber-300">No</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recipients
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {status.recipientCount === 0 ? (
                  <span className="text-amber-800 dark:text-amber-300">0</span>
                ) : (
                  status.recipientCount
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Last attempt
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {status.lastAttempt ? (
                  <span>
                    {status.lastAttempt.reportDate} · {status.lastAttempt.status}
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {formatColombo(status.lastAttempt.createdAt)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">None yet</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Next scheduled run
              </dt>
              <dd className="mt-1 font-medium text-foreground">{status.nextScheduledLabel}</dd>
            </div>
          </dl>

          {blockerHints.length > 0 && (
            <div className="rounded-lg border border-amber-400/50 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
              <ul className="list-disc space-y-1 pl-4">
                {blockerHints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
              <p className="mt-2">
                <Link
                  href="/dashboard/settings/sms-portal"
                  className="font-medium underline underline-offset-2"
                >
                  Open SMS Portal settings
                </Link>
              </p>
            </div>
          )}

          <div className="border-t border-border/50 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Send for date
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              Catch up when automation never ran for a day (works even with no prior log row).
            </p>
            <DailySalesSmsSendForDate />
          </div>
        </CardContent>
      </Card>

      <DailySalesSmsLogsPanel
        logs={smsLogs}
        emptyHint="No daily sales SMS attempts yet. Configure recipients under Settings → SMS Portal, then wait for the 09:00 Asia/Colombo job or use Send for date."
      />
    </div>
  );
}
