import { fetchAuditLogs, writeAuditLog } from "@/lib/audit-log";

type ReportDownloadLogInput = {
  companyId: string;
  userId?: string | null;
  reportKey: string;
  reportLabel: string;
  filters?: string | null;
  fileName: string;
};

export type ReportDownloadLogRecord = {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  reportKey: string;
  reportLabel: string;
  filters: string | null;
  fileName: string;
  createdAt: string;
};

export async function logReportDownload(input: ReportDownloadLogInput) {
  await writeAuditLog({
    companyId: input.companyId,
    actorUserId: input.userId ?? null,
    module: "reports",
    action: "download",
    entityType: "Report",
    entityId: input.reportKey,
    summary: `${input.reportLabel} downloaded`,
    metadata: {
      reportKey: input.reportKey,
      reportLabel: input.reportLabel,
      filters: input.filters ?? null,
      fileName: input.fileName,
    },
  });
}

export async function fetchRecentReportDownloadLogs(companyId: string, limit = 12) {
  const rows = await fetchAuditLogs({
    companyId,
    module: "reports",
    action: "download",
    limit,
  });

  return rows.map((row) => {
    const metadata = (row.metadata ?? {}) as {
      reportKey?: string;
      reportLabel?: string;
      filters?: string | null;
      fileName?: string;
    };

    return {
      id: row.id,
      userId: row.actorUserId,
      userName: row.actorUserName,
      userEmail: row.actorUserEmail,
      reportKey: metadata.reportKey ?? row.entityId ?? "report",
      reportLabel: metadata.reportLabel ?? row.summary,
      filters: metadata.filters ?? null,
      fileName: metadata.fileName ?? "-",
      createdAt: row.createdAt,
    } satisfies ReportDownloadLogRecord;
  });
}
