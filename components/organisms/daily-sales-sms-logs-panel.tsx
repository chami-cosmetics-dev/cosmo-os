import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DailySalesSmsResendButton } from "@/components/molecules/daily-sales-sms-resend-button";
import { normalizeRecipientList } from "@/lib/daily-sales-sms";

export type DailySalesSmsLogRow = {
  id: string;
  reportDate: string;
  status: string;
  source: string;
  errorSummary: string | null;
  recipients: unknown;
  createdAt: Date;
};

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

function recipientsLabel(raw: unknown): string {
  const list = normalizeRecipientList(raw);
  return list.length > 0 ? list.join(", ") : "—";
}

export function DailySalesSmsLogsPanel({
  logs,
  emptyHint,
}: {
  logs: DailySalesSmsLogRow[];
  emptyHint?: string;
}) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50">
        <div className="flex items-center justify-between">
          <CardTitle>Daily Sales SMS</CardTitle>
          <span className="text-sm text-muted-foreground">
            {logs.length} record{logs.length !== 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            {emptyHint ??
              "No daily sales SMS attempts yet. Configure recipients under Settings → SMS Portal, then wait for the scheduled job or use Send for date / Resend."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Sent At (Colombo)</th>
                  <th className="px-4 py-3">Report date</th>
                  <th className="px-4 py-3">Recipients</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Error</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-border/60 align-top hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatColombo(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{log.reportDate}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {recipientsLabel(log.recipients)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          log.source === "manual" || log.source === "preview_test"
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
                            : log.status.startsWith("skipped")
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-red-600 dark:text-red-400">
                      {log.errorSummary ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <DailySalesSmsResendButton reportDate={log.reportDate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
