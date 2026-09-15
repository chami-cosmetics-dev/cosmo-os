import { z } from "zod";

export const NIGHTLY_LOGS_DEFAULT_LIMIT = 20;
export const NIGHTLY_LOGS_LIMIT_OPTIONS = [10, 20, 50] as const;

export const nightlyLogsQuerySchema = z.object({
  kind: z.enum(["ogf", "sms"]).default("ogf"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((n) => (NIGHTLY_LOGS_LIMIT_OPTIONS as readonly number[]).includes(n), {
      message: "Invalid limit",
    })
    .default(NIGHTLY_LOGS_DEFAULT_LIMIT),
});

export type NightlyLogsPagination = {
  page: number;
  limit: number;
  total: number;
};

export type OgfEmailLogDto = {
  id: string;
  batchCode: string;
  orderCount: number;
  emailTo: string;
  status: string;
  errorMessage: string | null;
  source: string;
  createdAt: string;
};

export type DailySalesSmsLogDto = {
  id: string;
  reportDate: string;
  status: string;
  source: string;
  errorSummary: string | null;
  recipients: unknown;
  recipientCount: number;
  createdAt: string;
};

export function parseBatchDate(batchCode: string): string {
  if (batchCode.length < 8) return batchCode;
  const dd = batchCode.slice(0, 2);
  const mm = batchCode.slice(2, 4);
  const yyyy = batchCode.slice(4, 8);
  return `${dd}/${mm}/${yyyy}`;
}

export function clampPage(page: number, limit: number, total: number): number {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return Math.min(Math.max(1, page), totalPages);
}
