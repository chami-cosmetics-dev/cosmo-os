import {
  getMerchantTargetPercent,
} from "@/lib/merchant-dashboard/cheer";
import type {
  DailySalesHistoryRow,
  MonthlySalesHistoryRow,
  MonthlySalesHistoryStatus,
} from "@/lib/merchant-dashboard/motivation-types";
import {
  buildDashboardSalesDateFilter,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import type { DashboardSalesDateType } from "@/lib/page-data/dashboard-overview-shared";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

/** Last N calendar months ending at `endYearMonth` (inclusive), oldest first. */
export function listLastYearMonths(endYearMonth: string, count: number): string[] {
  const [y, m] = endYearMonth.split("-").map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(y, m - 1 - i, 1));
    const ym = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push(ym);
  }
  return out;
}

export function monthBounds(yearMonth: string): { fromYmd: string; toYmd: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    fromYmd: `${yearMonth}-01`,
    toYmd: `${yearMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** All Colombo days from month start through todayYmd (inclusive). */
export function listDaysThroughToday(yearMonth: string, todayYmd: string): string[] {
  const { fromYmd, toYmd: monthEnd } = monthBounds(yearMonth);
  if (todayYmd < fromYmd) return [];
  const end = todayYmd.startsWith(yearMonth) ? todayYmd : monthEnd;
  const days: string[] = [];
  let [y, m, d] = fromYmd.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  while (y < ey || (y === ey && m < em) || (y === ey && m === em && d <= ed)) {
    days.push(
      `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }
  return days;
}

export function buildDailyHistoryRows(
  yearMonth: string,
  todayYmd: string,
  byDay: Map<string, { total: number; orderCount: number }>,
): DailySalesHistoryRow[] {
  return listDaysThroughToday(yearMonth, todayYmd).map((ymd) => {
    const hit = byDay.get(ymd);
    return {
      ymd,
      total: hit?.total ?? 0,
      orderCount: hit?.orderCount ?? 0,
    };
  });
}

export function buildMonthlyHistoryStatus(input: {
  achieved: number;
  targetAmount: number | null;
  yearMonth: string;
  currentYearMonth: string;
}): { percent: number | null; status: MonthlySalesHistoryStatus } {
  const percent = getMerchantTargetPercent(input.achieved, input.targetAmount ?? 0);
  if (input.targetAmount == null || input.targetAmount <= 0) {
    return { percent: null, status: "no_target" };
  }
  if ((percent ?? 0) >= 100) return { percent, status: "achieved" };
  if (input.yearMonth === input.currentYearMonth) return { percent, status: "on_track" };
  return { percent, status: "missed" };
}

/**
 * Daily (current month → today) + monthly (last 3 months) for one merchant.
 * History window always anchors to real today / current month (not admin yearMonth browse).
 */
export async function fetchMerchantSalesHistory(
  companyId: string,
  merchantUserId: string,
  params?: { todayYmd?: string; dateType?: DashboardSalesDateType },
): Promise<{ daily: DailySalesHistoryRow[]; monthly: MonthlySalesHistoryRow[] }> {
  const dateType: DashboardSalesDateType = params?.dateType ?? "all_orders";
  const todayYmd = params?.todayYmd ?? formatAppIsoDate(new Date());
  const currentYearMonth = todayYmd.slice(0, 7);
  const yearMonths = listLastYearMonths(currentYearMonth, 3);
  const historyFrom = monthBounds(yearMonths[0]!).fromYmd;
  const historyTo = todayYmd;

  const merchant = await prisma.user.findFirst({
    where: { id: merchantUserId, companyId },
    select: { id: true, couponCodes: true },
  });
  if (!merchant) {
    return {
      daily: buildDailyHistoryRows(currentYearMonth, todayYmd, new Map()),
      monthly: yearMonths.map((ym) => ({
        yearMonth: ym,
        total: 0,
        orderCount: 0,
        targetAmount: null,
        percent: null,
        status: "no_target" as const,
      })),
    };
  }

  const couponSet = new Set(
    merchant.couponCodes.map((c) => c.trim().toLowerCase()).filter(Boolean),
  );

  const fromDate = parseDayStartUtc(historyFrom);
  const toDate = parseDayEndUtc(historyTo);
  const dateFilter = buildDashboardSalesDateFilter({
    fromDate,
    toDate,
    dateType,
  });

  const [orders, targets] = await Promise.all([
    prisma.order.findMany({
      where: { companyId, ...dateFilter },
      select: {
        companyLocationId: true,
        assignedMerchantId: true,
        totalPrice: true,
        sourceName: true,
        financialStatus: true,
        fulfillmentStatus: true,
        fulfillmentStage: true,
        deliveryCompleteAt: true,
        invoiceCompleteAt: true,
        discountCodes: true,
        rawPayload: true,
        createdAt: true,
        assignedMerchant: { select: { couponCodes: true } },
      },
    }),
    prisma.merchantMonthlyTarget.findMany({
      where: {
        companyId,
        userId: merchantUserId,
        yearMonth: { in: yearMonths },
      },
      select: { yearMonth: true, targetAmount: true },
    }),
  ]);

  const targetByMonth = new Map(
    targets.map((t) => [t.yearMonth, Number(t.targetAmount)]),
  );

  const byDay = new Map<string, { total: number; orderCount: number }>();
  const byMonth = new Map<string, { total: number; orderCount: number }>();
  for (const ym of yearMonths) {
    byMonth.set(ym, { total: 0, orderCount: 0 });
  }

  for (const order of orders) {
    if (!isDashboardSalesOrderEligible(order, dateType)) continue;

    const merchantCouponCode = getMerchantCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
      assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
      joinAllDiscountCodes: true,
    });
    const orderCoupons = (merchantCouponCode ?? "")
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    let attributed = false;
    for (const code of orderCoupons) {
      if (couponSet.has(code)) {
        attributed = true;
        break;
      }
    }
    if (!attributed && order.assignedMerchantId === merchantUserId) {
      attributed = true;
    }
    if (!attributed) continue;

    const amount = Number(order.totalPrice ?? 0);
    const ymd = formatAppIsoDate(order.createdAt);
    const ym = ymd.slice(0, 7);

    if (ymd.startsWith(currentYearMonth) && ymd <= todayYmd) {
      const day = byDay.get(ymd) ?? { total: 0, orderCount: 0 };
      day.total += amount;
      day.orderCount += 1;
      byDay.set(ymd, day);
    }

    const month = byMonth.get(ym);
    if (month) {
      month.total += amount;
      month.orderCount += 1;
    }
  }

  const daily = buildDailyHistoryRows(currentYearMonth, todayYmd, byDay);
  const monthly: MonthlySalesHistoryRow[] = yearMonths.map((ym) => {
    const row = byMonth.get(ym) ?? { total: 0, orderCount: 0 };
    const targetAmount = targetByMonth.get(ym) ?? null;
    const { percent, status } = buildMonthlyHistoryStatus({
      achieved: row.total,
      targetAmount,
      yearMonth: ym,
      currentYearMonth,
    });
    return {
      yearMonth: ym,
      total: row.total,
      orderCount: row.orderCount,
      targetAmount,
      percent,
      status,
    };
  });

  return { daily, monthly };
}
