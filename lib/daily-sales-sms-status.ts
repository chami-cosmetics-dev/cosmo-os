import { normalizeRecipientList } from "@/lib/daily-sales-sms";

export const DAILY_SALES_SMS_NEXT_RUN_LABEL = "09:00 Asia/Colombo";

export type DailySalesSmsLastAttempt = {
  reportDate: string;
  status: string;
  createdAt: Date;
  errorSummary: string | null;
};

export type DailySalesSmsStatusSummary = {
  enabled: boolean;
  recipientCount: number;
  lastAttempt: DailySalesSmsLastAttempt | null;
  nextScheduledLabel: string;
};

export function buildDailySalesSmsStatusSummary(input: {
  enabled: boolean | null | undefined;
  recipients: unknown;
  lastLog?: {
    reportDate: string;
    status: string;
    createdAt: Date;
    errorSummary: string | null;
  } | null;
}): DailySalesSmsStatusSummary {
  const recipients = normalizeRecipientList(input.recipients);
  const last = input.lastLog;
  return {
    enabled: Boolean(input.enabled),
    recipientCount: recipients.length,
    lastAttempt: last
      ? {
          reportDate: last.reportDate,
          status: last.status,
          createdAt: last.createdAt,
          errorSummary: last.errorSummary ?? null,
        }
      : null,
    nextScheduledLabel: DAILY_SALES_SMS_NEXT_RUN_LABEL,
  };
}
