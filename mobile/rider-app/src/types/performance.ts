export type RiderPerformancePeriodKind = "current" | "previous";

export type RiderPerformanceLine = {
  taskId: string;
  orderId: string;
  orderLabel: string;
  completedAt: string | null;
  incentiveAmount: string;
  tenant?: string;
  companyLabel?: string;
};

export type RiderPerformanceResponse = {
  paydayConfigured: boolean;
  paydayDayOfMonth: number | null;
  period: {
    kind: RiderPerformancePeriodKind;
    from: string;
    to: string;
  } | null;
  completedCount: number | null;
  failedCount: number | null;
  incentiveTotal: string | null;
  todayCompletedCount: number;
  todayIncentiveTotal: string;
  lines: RiderPerformanceLine[];
};
