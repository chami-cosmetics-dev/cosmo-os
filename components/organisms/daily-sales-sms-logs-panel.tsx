"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquareText } from "lucide-react";

import { DailySalesSmsResendButton } from "@/components/molecules/daily-sales-sms-resend-button";
import { DailySalesSmsSendForDate } from "@/components/molecules/daily-sales-sms-send-for-date";
import {
  LogSourcePill,
  LogStatusPill,
} from "@/components/molecules/log-status-pills";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { normalizeRecipientList } from "@/lib/daily-sales-sms-recipients";
import { formatAppDateTimeShort } from "@/lib/format-datetime";
import {
  NIGHTLY_LOGS_DEFAULT_LIMIT,
  type DailySalesSmsLogDto,
  type NightlyLogsPagination,
} from "@/lib/nightly-logs";
import { notify } from "@/lib/notify";

function recipientsLabel(raw: unknown, recipientCount: number): string {
  const list = normalizeRecipientList(raw);
  if (list.length > 0) return list.join(", ");
  if (recipientCount > 0) return `${recipientCount} recipient${recipientCount !== 1 ? "s" : ""}`;
  return "—";
}

type Props = {
  initialLogs: DailySalesSmsLogDto[];
  initialPagination: NightlyLogsPagination;
  emptyHint?: string;
  showSendForDate?: boolean;
};

export function DailySalesSmsLogsPanel({
  initialLogs,
  initialPagination,
  emptyHint,
  showSendForDate = false,
}: Props) {
  const [logs, setLogs] = useState(initialLogs);
  const [pagination, setPagination] = useState(initialPagination);
  const [page, setPage] = useState(initialPagination.page);
  const [limit, setLimit] = useState(initialPagination.limit);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (nextPage: number, nextLimit: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        kind: "sms",
        page: String(nextPage),
        limit: String(nextLimit),
      });
      const res = await fetch(`/api/admin/ogf-logs?${params}`);
      const data = (await res.json()) as {
        logs?: DailySalesSmsLogDto[];
        pagination?: NightlyLogsPagination;
        error?: string;
      };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load daily sales SMS logs");
        return;
      }
      setLogs(data.logs ?? []);
      if (data.pagination) {
        setPagination(data.pagination);
        setPage(data.pagination.page);
        setLimit(data.pagination.limit);
      }
    } catch {
      notify.error("Network error — could not load daily sales SMS logs");
    } finally {
      setLoading(false);
    }
  }, []);

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
              <MessageSquareText className="size-4 text-muted-foreground" aria-hidden />
              Daily sales SMS
            </CardTitle>
            <CardDescription>
              Scheduled and manual daily sales SMS attempts. Resend a report date from any row.
            </CardDescription>
          </div>
          <span className="text-sm text-muted-foreground">
            {pagination.total} total
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {showSendForDate ? (
          <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Send for date
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              Catch up when automation missed a day (works even with no prior log row).
            </p>
            <DailySalesSmsSendForDate />
          </div>
        ) : null}

        {logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
            {emptyHint ??
              "No daily sales SMS attempts yet. Configure recipients under Settings → SMS Portal, then wait for the scheduled job or use Send for date / Resend."}
          </div>
        ) : (
          <ul className="space-y-3">
            {logs.map((log) => {
              const recipients = recipientsLabel(log.recipients, log.recipientCount);
              return (
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
                          Report {log.reportDate}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {log.recipientCount} recipient
                          {log.recipientCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <p className="truncate text-sm text-muted-foreground" title={recipients}>
                        {recipients}
                      </p>
                      {log.errorSummary ? (
                        <p
                          className="line-clamp-2 text-xs text-red-600 dark:text-red-400"
                          title={log.errorSummary}
                        >
                          {log.errorSummary}
                        </p>
                      ) : null}
                    </div>
                    <DailySalesSmsResendButton
                      reportDate={log.reportDate}
                      onDone={() => void load(page, limit)}
                    />
                  </div>
                </li>
              );
            })}
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

/** @deprecated Prefer DailySalesSmsLogsPanel with pagination props. */
export type DailySalesSmsLogRow = {
  id: string;
  reportDate: string;
  status: string;
  source: string;
  errorSummary: string | null;
  recipients: unknown;
  createdAt: Date;
};
