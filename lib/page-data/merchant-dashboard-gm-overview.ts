import { getMerchantTargetPercent } from "@/lib/merchant-dashboard/cheer";
import {
  mergeMerchantCohortWithDmBucket,
  resolveChannelPercent,
  resolveEffectiveTotalTarget,
  sumChannelBuckets,
  type ChannelSalesBucket,
  type MerchantChannelSales,
} from "@/lib/merchant-dashboard/channel-sales";
import { dmBucketShareForHolder } from "@/lib/merchant-dm-sales";
import {
  buildGmAlerts,
  buildGmPulse,
  computeHealthStatus,
  computeInterestedPct,
  getExpectedPacePercent,
  getPaceStatus,
  type GmAlert,
  type GmPulseInput,
  type MerchantHealthStatus,
  type MerchantPaceStatus,
} from "@/lib/merchant-dashboard/gm-score";
import {
  dailyWorkingTarget,
  prorateMonthlyTargetForPeriod,
} from "@/lib/merchant-dashboard/target-prorate";
import type { CohortSalesResult } from "@/lib/page-data/merchant-dashboard-peers";
import { prisma } from "@/lib/prisma";

export type GmChannelFooter = {
  periodLabel: string;
  fromYmd: string;
  toYmd: string;
  shop: ChannelSalesBucket;
  online: ChannelSalesBucket;
  grandTotal: ChannelSalesBucket;
};

export type MerchantDashboardOverviewRow = {
  merchantId: string;
  displayName: string;
  targetAmount: number | null;
  mtdSales: number;
  todaySales: number;
  periodSales: number;
  percent: number | null;
  status: "achieved" | "behind" | "no_target";
  callsMtd: number;
  callsToday: number;
  interestedCount: number;
  interestedPct: number | null;
  returnRatePct: number | null;
  pendingQueueCount: number;
  healthStatus: MerchantHealthStatus;
  paceStatus: MerchantPaceStatus;
  isShopMerchant: boolean;
  outletName: string | null;
  shop: ChannelSalesBucket;
  online: ChannelSalesBucket;
  shopTargetAmount: number | null;
  onlineTargetAmount: number | null;
  shopPercent: number | null;
  onlinePercent: number | null;
  effectiveTotalTarget: number | null;
  /** Monthly target prorated to active GM period (working days). */
  periodTargetAmount: number | null;
  /** Monthly target ÷ working days in month. */
  dailyTargetAmount: number | null;
  shopPeriodTargetAmount: number | null;
  onlinePeriodTargetAmount: number | null;
  hasDmSplit: boolean;
  merPeriodSales: number;
  dmPeriodSales: number;
};

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

function periodLabel(input: {
  fromYmd: string;
  toYmd: string;
  todayYmd: string;
}): string {
  if (input.fromYmd === input.toYmd && input.fromYmd === input.todayYmd) {
    return "Today";
  }
  if (input.fromYmd.endsWith("-01") && input.toYmd === input.todayYmd) {
    return "MTD";
  }
  return `${input.fromYmd} – ${input.toYmd}`;
}

const INTERESTED_CATEGORIES = new Set(["Interested", "Interested-SMS"]);

type CallAggRow = {
  merchantId: string;
  category: string | null;
  count: number;
};

type ChannelTargets = {
  targetAmount: number | null;
  shopTargetAmount: number | null;
  onlineTargetAmount: number | null;
};

type StaffProfile = {
  isShopMerchant: boolean;
  outletName: string | null;
};

async function fetchCallAgg(input: {
  companyId: string;
  merchantIds: string[];
  fromYmd: string;
  toYmd: string;
}): Promise<CallAggRow[]> {
  if (input.merchantIds.length === 0) return [];

  const fromDate = parseDayStartUtc(input.fromYmd);
  const toDate = parseDayEndUtc(input.toYmd);
  if (fromDate > toDate) return [];

  const rows = await prisma.$queryRaw<
    Array<{ merchantId: string; category: string | null; count: bigint }>
  >`
    SELECT
      "merchantId",
      "category",
      COUNT(*)::bigint AS "count"
    FROM "ContactAllocationUpdate"
    WHERE "companyId" = ${input.companyId}
      AND "merchantId" = ANY(${input.merchantIds})
      AND "createdAt" >= ${fromDate}
      AND "createdAt" <= ${toDate}
      AND "category" IS DISTINCT FROM 'allocation'
    GROUP BY "merchantId", "category"
  `;

  return rows.map((row) => ({
    merchantId: row.merchantId,
    category: row.category,
    count: Number(row.count),
  }));
}

function summarizeCalls(rows: CallAggRow[]): Map<
  string,
  { total: number; interested: number }
> {
  const byMerchant = new Map<string, { total: number; interested: number }>();
  for (const row of rows) {
    const hit = byMerchant.get(row.merchantId) ?? { total: 0, interested: 0 };
    hit.total += row.count;
    if (row.category && INTERESTED_CATEGORIES.has(row.category)) {
      hit.interested += row.count;
    }
    byMerchant.set(row.merchantId, hit);
  }
  return byMerchant;
}

async function fetchReturnRates(input: {
  companyId: string;
  merchantIds: string[];
  fromYmd: string;
  toYmd: string;
  orderCountByMerchant: Map<string, number>;
}): Promise<Map<string, number | null>> {
  if (input.merchantIds.length === 0) return new Map();

  const fromDate = parseDayStartUtc(input.fromYmd);
  const toDate = parseDayEndUtc(input.toYmd);
  if (fromDate > toDate) return new Map();

  const returns = await prisma.orderReturn.findMany({
    where: {
      companyId: input.companyId,
      merchantUserId: { in: input.merchantIds },
      returnDate: { gte: fromDate, lte: toDate },
    },
    select: { merchantUserId: true, orderId: true },
  });

  const orderIdsByMerchant = new Map<string, Set<string>>();
  for (const row of returns) {
    if (!row.merchantUserId) continue;
    const set = orderIdsByMerchant.get(row.merchantUserId) ?? new Set<string>();
    set.add(row.orderId);
    orderIdsByMerchant.set(row.merchantUserId, set);
  }

  const out = new Map<string, number | null>();
  for (const merchantId of input.merchantIds) {
    const orderCount = input.orderCountByMerchant.get(merchantId) ?? 0;
    const returnOrderCount = orderIdsByMerchant.get(merchantId)?.size ?? 0;
    out.set(
      merchantId,
      orderCount > 0
        ? Math.round((returnOrderCount / orderCount) * 1000) / 10
        : null,
    );
  }
  return out;
}

async function fetchPendingQueueCounts(input: {
  companyId: string;
  merchantIds: string[];
}): Promise<Map<string, number>> {
  if (input.merchantIds.length === 0) return new Map();

  const rows = await prisma.contactInsightCallQueue.groupBy({
    by: ["merchantUserId"],
    where: {
      companyId: input.companyId,
      status: "pending",
      merchantUserId: { in: input.merchantIds },
    },
    _count: { _all: true },
  });

  const out = new Map<string, number>();
  for (const row of rows) {
    if (!row.merchantUserId) continue;
    out.set(row.merchantUserId, row._count._all);
  }
  return out;
}

async function fetchStaffProfiles(input: {
  companyId: string;
  merchantIds: string[];
}): Promise<Map<string, StaffProfile>> {
  if (input.merchantIds.length === 0) return new Map();

  const rows = await prisma.employeeProfile.findMany({
    where: {
      companyId: input.companyId,
      userId: { in: input.merchantIds },
    },
    select: {
      userId: true,
      isShopMerchant: true,
      location: { select: { name: true } },
    },
  });

  const out = new Map<string, StaffProfile>();
  for (const row of rows) {
    out.set(row.userId, {
      isShopMerchant: row.isShopMerchant,
      outletName: row.location?.name ?? null,
    });
  }
  return out;
}

export async function buildGmOverview(input: {
  companyId: string;
  merchants: MerchantDashboardMerchantOption[];
  targetsByMerchant: Map<string, ChannelTargets>;
  periodCohort: CohortSalesResult;
  mtdSalesByMerchant: Map<string, number>;
  mtdOrderCountByMerchant: Map<string, number>;
  todaySalesByMerchant: Map<string, number>;
  yearMonth: string;
  todayYmd: string;
  fromYmd: string;
  toYmd: string;
  isCurrentMonth: boolean;
  dmHolderIds: string[];
}): Promise<{
  overview: MerchantDashboardOverviewRow[];
  pulse: GmPulseInput;
  alerts: GmAlert[];
  channelFooter: GmChannelFooter;
}> {
  const merchantIds = input.merchants.map((m) => m.id);
  const expectedPacePercent = getExpectedPacePercent(input.yearMonth, input.todayYmd);

  const [callsMtdRows, callsTodayRows, returnRates, pendingQueue, staffProfiles] =
    await Promise.all([
      fetchCallAgg({
        companyId: input.companyId,
        merchantIds,
        fromYmd: input.fromYmd,
        toYmd: input.toYmd,
      }),
      fetchCallAgg({
        companyId: input.companyId,
        merchantIds,
        fromYmd: input.todayYmd,
        toYmd: input.todayYmd,
      }),
      fetchReturnRates({
        companyId: input.companyId,
        merchantIds,
        fromYmd: input.fromYmd,
        toYmd: input.toYmd,
        orderCountByMerchant: input.mtdOrderCountByMerchant,
      }),
      fetchPendingQueueCounts({
        companyId: input.companyId,
        merchantIds,
      }),
      fetchStaffProfiles({
        companyId: input.companyId,
        merchantIds,
      }),
    ]);

  const callsMtd = summarizeCalls(callsMtdRows);
  const callsToday = summarizeCalls(callsTodayRows);
  const channelSplits: MerchantChannelSales[] = [];
  const dmRow = input.periodCohort.dmBucketId
    ? input.periodCohort.byMerchant.get(input.periodCohort.dmBucketId)
    : undefined;

  const overview: MerchantDashboardOverviewRow[] = input.merchants.map(
    (merchant) => {
      const targets = input.targetsByMerchant.get(merchant.id) ?? {
        targetAmount: null,
        shopTargetAmount: null,
        onlineTargetAmount: null,
      };
      const periodRow = input.periodCohort.byMerchant.get(merchant.id);
      const dmShare = dmBucketShareForHolder(merchant.id, input.dmHolderIds);
      const merPeriodSales = periodRow?.total ?? 0;
      const dmPeriodSales =
        dmRow && dmShare > 0 ? dmRow.total * dmShare : 0;
      const mergedPeriod = mergeMerchantCohortWithDmBucket({
        merchantRow: periodRow,
        dmRow,
        dmShare,
      });
      const periodSales = mergedPeriod.total;
      const mtdSales = input.mtdSalesByMerchant.get(merchant.id) ?? 0;
      const todaySales = input.todaySalesByMerchant.get(merchant.id) ?? 0;
      const effectiveTotalTarget = resolveEffectiveTotalTarget(targets);
      const periodTargetAmount = prorateMonthlyTargetForPeriod({
        monthlyTarget: effectiveTotalTarget,
        yearMonth: input.yearMonth,
        fromYmd: input.fromYmd,
        toYmd: input.toYmd,
      });
      const dailyTargetAmount = dailyWorkingTarget(
        effectiveTotalTarget,
        input.yearMonth,
      );
      const shopPeriodTargetAmount = prorateMonthlyTargetForPeriod({
        monthlyTarget: targets.shopTargetAmount,
        yearMonth: input.yearMonth,
        fromYmd: input.fromYmd,
        toYmd: input.toYmd,
      });
      const onlinePeriodTargetAmount = prorateMonthlyTargetForPeriod({
        monthlyTarget: targets.onlineTargetAmount,
        yearMonth: input.yearMonth,
        fromYmd: input.fromYmd,
        toYmd: input.toYmd,
      });
      const percent = getMerchantTargetPercent(
        periodSales,
        periodTargetAmount ?? 0,
      );
      let status: MerchantDashboardOverviewRow["status"] = "no_target";
      if (periodTargetAmount != null && periodTargetAmount > 0) {
        status = (percent ?? 0) >= 100 ? "achieved" : "behind";
      }

      const channel = mergedPeriod.channel;
      channelSplits.push(channel);

      const staff = staffProfiles.get(merchant.id) ?? {
        isShopMerchant: false,
        outletName: null,
      };

      const mtdCall = callsMtd.get(merchant.id) ?? { total: 0, interested: 0 };
      const todayCall = callsToday.get(merchant.id) ?? { total: 0, interested: 0 };
      const interestedPct = computeInterestedPct({
        interestedCount: mtdCall.interested,
        totalCalls: mtdCall.total,
      });
      const returnRatePct = returnRates.get(merchant.id) ?? null;
      const pendingQueueCount = pendingQueue.get(merchant.id) ?? 0;
      const paceStatus = getPaceStatus({
        targetPercent: percent,
        expectedPacePercent,
      });
      const healthStatus = computeHealthStatus({
        targetPercent: percent,
        expectedPacePercent,
        callsToday: todayCall.total,
        callsMtd: mtdCall.total,
        interestedPct,
        returnRatePct,
        pendingQueueCount,
        isCurrentMonth: input.isCurrentMonth,
      });

      const channelTotal = channel.shop.amount + channel.online.amount;
      return {
        merchantId: merchant.id,
        displayName: merchant.displayName,
        targetAmount: targets.targetAmount,
        mtdSales,
        todaySales,
        periodSales,
        percent:
          effectiveTotalTarget != null && effectiveTotalTarget > 0
            ? percent
            : null,
        status,
        callsMtd: mtdCall.total,
        callsToday: todayCall.total,
        interestedCount: mtdCall.interested,
        interestedPct,
        returnRatePct,
        pendingQueueCount,
        healthStatus,
        paceStatus,
        isShopMerchant: staff.isShopMerchant,
        outletName: staff.outletName,
        shop: channel.shop,
        online: channel.online,
        shopTargetAmount: targets.shopTargetAmount,
        onlineTargetAmount: targets.onlineTargetAmount,
        shopPercent: resolveChannelPercent({
          actual: channel.shop.amount,
          target: shopPeriodTargetAmount,
          channelTotal,
        }),
        onlinePercent: resolveChannelPercent({
          actual: channel.online.amount,
          target: onlinePeriodTargetAmount,
          channelTotal,
        }),
        effectiveTotalTarget,
        periodTargetAmount,
        dailyTargetAmount,
        shopPeriodTargetAmount,
        onlinePeriodTargetAmount,
        hasDmSplit: dmShare > 0,
        merPeriodSales,
        dmPeriodSales,
      };
    },
  );

  const channelTotals = sumChannelBuckets(channelSplits);
  const channelFooter: GmChannelFooter = {
    periodLabel: periodLabel({
      fromYmd: input.fromYmd,
      toYmd: input.toYmd,
      todayYmd: input.todayYmd,
    }),
    fromYmd: input.fromYmd,
    toYmd: input.toYmd,
    shop: channelTotals.shop,
    online: channelTotals.online,
    grandTotal: {
      amount: channelTotals.shop.amount + channelTotals.online.amount,
      orderCount:
        channelTotals.shop.orderCount + channelTotals.online.orderCount,
    },
  };

  const pulse = buildGmPulse(
    overview.map((row) => ({
      todaySales: row.todaySales,
      mtdSales: row.periodSales,
      targetAmount: row.periodTargetAmount,
      percent: row.percent,
      status: row.status,
      callsToday: row.callsToday,
      callsMtd: row.callsMtd,
    })),
  );

  const alerts = overview
    .flatMap((row) =>
      buildGmAlerts({
        merchantId: row.merchantId,
        displayName: row.displayName,
        targetPercent: row.percent,
        expectedPacePercent,
        callsToday: row.callsToday,
        interestedCount: row.interestedCount,
        returnRatePct: row.returnRatePct,
        pendingQueueCount: row.pendingQueueCount,
        isCurrentMonth: input.isCurrentMonth,
      }),
    )
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === "critical" ? -1 : 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });

  return {
    overview,
    pulse: {
      ...pulse,
      alertCount: alerts.length,
      shopAmount: channelFooter.shop.amount,
      onlineAmount: channelFooter.online.amount,
      shopOrderCount: channelFooter.shop.orderCount,
      onlineOrderCount: channelFooter.online.orderCount,
    },
    alerts,
    channelFooter,
  };
}
