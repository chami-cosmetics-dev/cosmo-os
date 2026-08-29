export type MerchantHealthStatus = "green" | "amber" | "red";

export type MerchantPaceStatus = "on_pace" | "behind" | "ahead" | "no_target";

export type GmAlertSeverity = "warning" | "critical";

export type GmAlert = {
  merchantId: string;
  displayName: string;
  severity: GmAlertSeverity;
  message: string;
};

export type GmScoreInput = {
  targetPercent: number | null;
  expectedPacePercent: number | null;
  callsToday: number;
  callsMtd: number;
  interestedPct: number | null;
  returnRatePct: number | null;
  pendingQueueCount: number;
  isCurrentMonth: boolean;
};

/** Expected MTD target % based on calendar day progress through the month. */
export function getExpectedPacePercent(
  yearMonth: string,
  todayYmd: string,
): number | null {
  if (!todayYmd.startsWith(yearMonth)) return null;
  const [, m] = yearMonth.split("-").map(Number);
  const [y] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayOfMonth = Number(todayYmd.slice(8, 10));
  if (!Number.isFinite(dayOfMonth) || dayOfMonth <= 0) return null;
  return Math.round((dayOfMonth / daysInMonth) * 1000) / 10;
}

export function getPaceStatus(input: {
  targetPercent: number | null;
  expectedPacePercent: number | null;
}): MerchantPaceStatus {
  if (input.targetPercent == null || input.expectedPacePercent == null) {
    return "no_target";
  }
  const gap = input.targetPercent - input.expectedPacePercent;
  if (gap >= 5) return "ahead";
  if (gap <= -10) return "behind";
  return "on_pace";
}

export function computeInterestedPct(input: {
  interestedCount: number;
  totalCalls: number;
}): number | null {
  if (input.totalCalls <= 0) return null;
  return Math.round((input.interestedCount / input.totalCalls) * 1000) / 10;
}

export function computeHealthStatus(input: GmScoreInput): MerchantHealthStatus {
  let score = 0;
  let signals = 0;

  if (input.targetPercent != null && input.expectedPacePercent != null) {
    signals += 1;
    const gap = input.targetPercent - input.expectedPacePercent;
    if (gap >= 0) score += 2;
    else if (gap >= -10) score += 1;
  }

  if (input.isCurrentMonth) {
    signals += 1;
    if (input.callsToday >= 20) score += 2;
    else if (input.callsToday >= 5) score += 1;
  } else if (input.callsMtd > 0) {
    signals += 1;
    score += 1;
  }

  if (input.interestedPct != null) {
    signals += 1;
    if (input.interestedPct >= 15) score += 2;
    else if (input.interestedPct >= 8) score += 1;
  }

  if (input.returnRatePct != null) {
    signals += 1;
    if (input.returnRatePct <= 3) score += 2;
    else if (input.returnRatePct <= 7) score += 1;
  }

  if (input.pendingQueueCount > 10) {
    score = Math.max(0, score - 1);
  }

  if (signals === 0) return "amber";
  const ratio = score / (signals * 2);
  if (ratio >= 0.7) return "green";
  if (ratio >= 0.4) return "amber";
  return "red";
}

export function buildGmAlerts(input: {
  merchantId: string;
  displayName: string;
  targetPercent: number | null;
  expectedPacePercent: number | null;
  callsToday: number;
  interestedCount: number;
  returnRatePct: number | null;
  pendingQueueCount: number;
  isCurrentMonth: boolean;
}): GmAlert[] {
  const alerts: GmAlert[] = [];

  if (
    input.isCurrentMonth &&
    input.targetPercent != null &&
    input.expectedPacePercent != null &&
    input.targetPercent < input.expectedPacePercent - 10
  ) {
    alerts.push({
      merchantId: input.merchantId,
      displayName: input.displayName,
      severity: "critical",
      message: `${Math.round(input.targetPercent)}% MTD vs ${Math.round(input.expectedPacePercent)}% expected pace`,
    });
  }

  if (input.isCurrentMonth && input.callsToday === 0) {
    alerts.push({
      merchantId: input.merchantId,
      displayName: input.displayName,
      severity: "warning",
      message: "No calls logged today",
    });
  }

  if (input.interestedCount >= 5 && input.callsToday > 0) {
    // surfaced when many interested but we'll check in loader with sales - skip here
  }

  if (input.returnRatePct != null && input.returnRatePct > 8) {
    alerts.push({
      merchantId: input.merchantId,
      displayName: input.displayName,
      severity: "warning",
      message: `Return rate ${input.returnRatePct}%`,
    });
  }

  if (input.pendingQueueCount > 5) {
    alerts.push({
      merchantId: input.merchantId,
      displayName: input.displayName,
      severity: "warning",
      message: `${input.pendingQueueCount} call-queue items pending`,
    });
  }

  return alerts;
}

export type GmPulseInput = {
  companyTodaySales: number;
  companyMtdSales: number;
  companyMtdTarget: number | null;
  companyMtdPercent: number | null;
  merchantsAchieved: number;
  merchantsBehind: number;
  merchantsNoTarget: number;
  totalCallsToday: number;
  totalCallsMtd: number;
  alertCount: number;
  shopAmount?: number;
  onlineAmount?: number;
  shopOrderCount?: number;
  onlineOrderCount?: number;
};

export function buildGmPulse(rows: {
  todaySales: number;
  mtdSales: number;
  targetAmount: number | null;
  percent: number | null;
  status: "achieved" | "behind" | "no_target";
  callsToday: number;
  callsMtd: number;
}[]): GmPulseInput {
  let companyMtdTarget = 0;
  let hasTarget = false;
  let merchantsAchieved = 0;
  let merchantsBehind = 0;
  let merchantsNoTarget = 0;
  let totalCallsToday = 0;
  let totalCallsMtd = 0;

  for (const row of rows) {
    totalCallsToday += row.callsToday;
    totalCallsMtd += row.callsMtd;
    if (row.targetAmount != null && row.targetAmount > 0) {
      hasTarget = true;
      companyMtdTarget += row.targetAmount;
      if (row.status === "achieved") merchantsAchieved += 1;
      else merchantsBehind += 1;
    } else {
      merchantsNoTarget += 1;
    }
  }

  const companyMtdSales = rows.reduce((sum, row) => sum + row.mtdSales, 0);
  const companyTodaySales = rows.reduce((sum, row) => sum + row.todaySales, 0);
  const companyMtdPercent =
    hasTarget && companyMtdTarget > 0
      ? Math.round((companyMtdSales / companyMtdTarget) * 1000) / 10
      : null;

  return {
    companyTodaySales,
    companyMtdSales,
    companyMtdTarget: hasTarget ? companyMtdTarget : null,
    companyMtdPercent,
    merchantsAchieved,
    merchantsBehind,
    merchantsNoTarget,
    totalCallsToday,
    totalCallsMtd,
    alertCount: 0,
  };
}
