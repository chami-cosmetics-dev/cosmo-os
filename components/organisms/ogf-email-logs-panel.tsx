"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";

import { OgfResendButton } from "@/components/molecules/ogf-resend-button";
import {
  LogSourcePill,
  LogStatusPill,
} from "@/components/molecules/log-status-pills";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { formatAppDateTimeShort } from "@/lib/format-datetime";
import {
  NIGHTLY_LOGS_DEFAULT_LIMIT,
  parseBatchDate,
  type NightlyLogsPagination,
  type OgfEmailLogDto,
} from "@/lib/nightly-logs";
import { notify } from "@/lib/notify";

type Props = {
  initialLogs: OgfEmailLogDto[];
  initialPagination: NightlyLogsPagination;
  ogfConfigured?: boolean;
};

export function OgfEmailLogsPanel({
  initialLogs,
  initialPagination,
  ogfConfigured = true,
}: Props) {
  const [logs, setLogs] = useState(initialLogs);
  const [pagination, setPagination] = useState(initialPagination);
  const [page, setPage] = useState(initialPagination.page);
  const [limit, setLimit] = useState(initialPagination.limit);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (nextPage: number, nextLimit: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          kind: "ogf",
          page: String(nextPage),
          limit: String(nextLimit),
        });
        const res = await fetch(`/api/admin/ogf-logs?${params}`);
        const data = (await res.json()) as {
          logs?: OgfEmailLogDto[];
          pagination?: NightlyLogsPagination;
          error?: string;
        };
        if (!res.ok) {
          notify.error(data.error ?? "Failed to load OGF email logs");
          return;
        }
        setLogs(data.logs ?? []);
        if (data.pagination) {
          setPagination(data.pagination);
          setPage(data.pagination.page);
          setLimit(data.pagination.limit);
        }
      } catch {
        notify.error("Network error — could not load OGF email logs");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setLogs(initialLogs);
    setPagination(initialPagination);
    setPage(initialPagination.page);
    setLimit(initialPagination.limit);
  }, [initialLogs, initialPagination]);

  return (
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4 text-muted-foreground" aria-hidden />
              OGF email history
            </CardTitle>
            <CardDescription>
              Nightly OGF sync summary emails. Resend a batch without waiting for the next cron.
            </CardDescription>
          </div>
          <span className="text-sm text-muted-foreground">
            {pagination.total} total
          </span>
        </div>
        {!ogfConfigured && (
          <div className="mt-3 rounded-lg border border-amber-400/50 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            OGF_LOCATION_ID is not configured on this deployment — OGF sync emails run on Cosmo OS
            only.
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
            No email logs yet. They appear after the next nightly OGF sync.
          </div>
        ) : (
          <ul className="space-y-3">
            {logs.map((log) => (
              <li
                key={log.id}
                className="rounded-xl border border-border/60 bg-background/80 p-4 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <LogStatusPill status={log.status} />
                      <LogSourcePill source={log.source} />
                      <span className="text-xs text-muted-foreground">
                        {formatAppDateTimeShort(log.createdAt)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Batch {parseBatchDate(log.batchCode)}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {log.batchCode}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {log.orderCount} order{log.orderCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <p className="truncate text-sm text-muted-foreground" title={log.emailTo}>
                      To: {log.emailTo}
                    </p>
                    {log.errorMessage ? (
                      <p
                        className="line-clamp-2 text-xs text-red-600 dark:text-red-400"
                        title={log.errorMessage}
                      >
                        {log.errorMessage}
                      </p>
                    ) : null}
                  </div>
                  <OgfResendButton
                    batchCode={log.batchCode}
                    onDone={() => void load(page, limit)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="relative border-t border-border/50 pt-4">
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : null}
          <Pagination
            page={pagination.page}
            limit={pagination.limit || NIGHTLY_LOGS_DEFAULT_LIMIT}
            total={pagination.total}
            onPageChange={(next) => {
              setPage(next);
              void load(next, limit);
            }}
            onLimitChange={(nextLimit) => {
              setLimit(nextLimit);
              setPage(1);
              void load(1, nextLimit);
            }}
            limitOptions={[10, 20, 50]}
          />
        </div>
      </CardContent>
    </Card>
  );
}
