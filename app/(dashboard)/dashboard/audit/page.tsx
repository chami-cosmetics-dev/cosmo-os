import { redirect } from "next/navigation";
import Link from "next/link";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { AuditFilterForm } from "@/components/organisms/audit-filter-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AUDIT_LOG_ACTIONS, AUDIT_LOG_MODULES, countAuditLogs, fetchAuditLogs } from "@/lib/audit-log";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type AuditPageProps = {
  searchParams: Promise<{
    module?: string;
    action?: string;
    q?: string;
    page?: string;
  }>;
};

const AUDIT_PAGE_SIZE = 10;

const actionLabels: Record<string, string> = {
  download: "Download",
  invite_created: "Invite Created",
  invite_resent: "Invite Resent",
  invite_cancelled: "Invite Cancelled",
  user_deleted: "User Deleted",
  user_roles_updated: "User Roles Updated",
  role_created: "Role Created",
  role_updated: "Role Updated",
  role_deleted: "Role Deleted",
  manual_order_created: "Manual Order Created",
  merchant_review_saved: "Merchant Review Saved",
  fulfillment_updated: "Fulfillment Updated",
  remark_created: "Remark Created",
  remark_updated: "Remark Updated",
  remark_deleted: "Remark Deleted",
  contact_created: "Contact Created",
  contact_imported: "Contacts Imported",
  contact_follow_up_contacted: "Contact Follow-up Contacted",
  contact_auto_created: "Contact Auto-Created",
  contact_auto_enriched: "Contact Auto-Enriched",
  contact_auto_sync_conflict: "Contact Auto-Sync Conflict",
  contact_backfill_run: "Contact Backfill Run",
  setting_created: "Setting Created",
  setting_updated: "Setting Updated",
  setting_deleted: "Setting Deleted",
  staff_updated: "Staff Updated",
  staff_resigned: "Staff Resigned",
  complaint_created: "Complaint Created",
  complaint_updated: "Complaint Updated",
};

function toTitleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseFilter(value: string | undefined, options: readonly string[]) {
  return value && options.includes(value) ? value : undefined;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function buildPageHref(
  params: Awaited<AuditPageProps["searchParams"]>,
  page: number
) {
  const next = new URLSearchParams();
  if (params.module) next.set("module", params.module);
  if (params.action) next.set("action", params.action);
  if (params.q?.trim()) next.set("q", params.q.trim());
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/dashboard/audit?${query}` : "/dashboard/audit";
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const auth = await requirePermission("users.read");
  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }
    return <PermissionDeniedCard />;
  }

  const resolvedSearchParams = await searchParams;
  const moduleFilter = parseFilter(resolvedSearchParams.module, AUDIT_LOG_MODULES);
  const actionFilter = parseFilter(resolvedSearchParams.action, AUDIT_LOG_ACTIONS);
  const queryFilter = resolvedSearchParams.q?.trim() || undefined;
  const requestedPage = parsePage(resolvedSearchParams.page);

  const auditQuery = {
    companyId: auth.context?.user?.companyId ?? null,
    module: moduleFilter,
    action: actionFilter,
    query: queryFilter,
  };

  const totalLogs = await countAuditLogs(auditQuery);
  const totalPages = Math.max(1, Math.ceil(totalLogs / AUDIT_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * AUDIT_PAGE_SIZE;
  const logs = await fetchAuditLogs({
    ...auditQuery,
    limit: AUDIT_PAGE_SIZE,
    offset,
  });

  const distinctModules = new Set(logs.map((log) => log.module)).size;
  const distinctActions = new Set(logs.map((log) => log.action)).size;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-6 shadow-[0_18px_40px_-28px_var(--primary)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Administration</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Audit Trail</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
          Categorized activity history for report downloads, user operations, and role changes across the system.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Card className="border-white/40 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Visible Events</p>
              <p className="mt-2 text-2xl font-semibold">{totalLogs}</p>
            </CardContent>
          </Card>
          <Card className="border-white/40 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Modules</p>
              <p className="mt-2 text-2xl font-semibold">{distinctModules}</p>
            </CardContent>
          </Card>
          <Card className="border-white/40 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Actions</p>
              <p className="mt-2 text-2xl font-semibold">{distinctActions}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50">
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <AuditFilterForm
            moduleOptions={AUDIT_LOG_MODULES}
            actionOptions={AUDIT_LOG_ACTIONS}
            actionLabels={actionLabels}
            initialModule={moduleFilter}
            initialAction={actionFilter}
            initialQuery={queryFilter}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Showing {totalLogs === 0 ? 0 : offset + 1}-{Math.min(offset + logs.length, totalLogs)} of {totalLogs}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No audit events matched the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Module</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Summary</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-border/60 align-top">
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(log.createdAt)}</td>
                      <td className="px-4 py-3 text-foreground">{toTitleCase(log.module)}</td>
                      <td className="px-4 py-3 text-foreground">{actionLabels[log.action] ?? toTitleCase(log.action)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{log.summary}</div>
                        {log.metadata ? (
                          <div className="mt-1 max-w-xl whitespace-pre-wrap break-words text-xs text-muted-foreground">
                            {JSON.stringify(log.metadata)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{log.actorUserName ?? "System"}</div>
                        <div className="text-xs text-muted-foreground">{log.actorUserEmail ?? log.actorUserId ?? "-"}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div>{log.entityType ?? "-"}</div>
                        <div className="text-xs">{log.entityId ?? "-"}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalLogs > AUDIT_PAGE_SIZE && (
            <div className="flex flex-col gap-3 border-t border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={buildPageHref(resolvedSearchParams, currentPage - 1)}>
                      Previous
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Previous
                  </Button>
                )}
                {currentPage < totalPages ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={buildPageHref(resolvedSearchParams, currentPage + 1)}>
                      Next
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Next
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

