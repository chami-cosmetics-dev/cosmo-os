import { Prisma } from "@prisma/client";

import {
  getMerchantCheerBand,
  getMerchantCheerMessage,
  getMerchantPeerCheerMessage,
  getMerchantTargetPercent,
  type MerchantCheerBand,
} from "@/lib/merchant-dashboard/cheer";
import type {
  LocationShareBundle,
  PeerBoardsDto,
  SalesHistoryDto,
  TodaySalesDto,
} from "@/lib/merchant-dashboard/motivation-types";
import { buildPeerBoard } from "@/lib/merchant-dashboard/peer-board";
import { getMerchantDisplayName } from "@/lib/merchant-groups";
import { canonicalizeMerchantDisplayName } from "@/lib/customer-insight/merchant-label-aliases";
import { normalizeDashboardMerchantLabel } from "@/lib/merchant-dm-sales";
import { isMerchantRoleName } from "@/lib/merchant-role";
import { fetchMerchantNearestBirthdays } from "@/lib/page-data/merchant-dashboard-birthdays";
import { fetchMerchantLoyaltyOutreach } from "@/lib/page-data/merchant-dashboard-loyalty";
import { fetchMerchantSalesHistory } from "@/lib/page-data/merchant-dashboard-history";
import {
  buildCohortPeerRows,
  buildLocationShareRows,
  fetchMerchantCohortSales,
} from "@/lib/page-data/merchant-dashboard-peers";
import {
  fetchMerchantDailyInvoices,
  fetchMerchantTopCustomersBySales,
  fetchMerchantReturnStats,
  fetchMerchantUserSales,
  type MerchantDailyInvoiceRow,
} from "@/lib/page-data/merchant-dashboard-sales";
import {
  fetchMerchantCosmeticsLkBreakdown,
  type MerchantCosmeticsLkBreakdownBundle,
} from "@/lib/page-data/merchant-dashboard-cosmetics-lk";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { listMerchantCallQueue, type CallQueueRowDto } from "@/lib/customer-insight/call-queue";
import type { GmAlert, GmPulseInput } from "@/lib/merchant-dashboard/gm-score";
import { dmBucketShareForHolder } from "@/lib/merchant-dm-sales";
import {
  mergeMerchantCohortWithDmBucket,
  resolveEffectiveTotalTarget,
} from "@/lib/merchant-dashboard/channel-sales";
import {
  buildGmOverview,
  type GmChannelFooter,
  type MerchantDashboardOverviewRow,
} from "@/lib/page-data/merchant-dashboard-gm-overview";
import { prisma } from "@/lib/prisma";

export type { MerchantDashboardOverviewRow };

export type MerchantDashboardMerchantOption = {
  id: string;
  displayName: string;
  email: string | null;
  roleNames: string[];
};

export type MerchantDashboardTargetDto = {
  yearMonth: string;
  targetAmount: number;
  shopTargetAmount: number | null;
  onlineTargetAmount: number | null;
  achievedAmount: number;
  percent: number | null;
  status: "on_track" | "achieved" | "missed" | "no_target";
  cheerBand: MerchantCheerBand;
  cheerMessage: string;
  assignedByName: string | null;
  assignedAt: string | null;
};

export type MerchantDashboardWholesaleTargetDto = {
  yearMonth: string;
  targetAmount: number;
  achievedAmount: number;
  percent: number | null;
  status: "on_track" | "achieved" | "missed" | "no_target";
  cheerBand: MerchantCheerBand;
  cheerMessage: string;
  assignedByName: string | null;
  assignedAt: string | null;
};

export type MerchantDashboardHistoryRow = {
  id: string;
  yearMonth: string;
  targetAmount: number;
  shopTargetAmount: number | null;
  onlineTargetAmount: number | null;
  achievedAmount: number | null;
  status: "achieved" | "not_achieved" | "in_progress" | "unknown";
  assignedByName: string | null;
  assignedAt: string | null;
  action: string;
};

export type MerchantDashboardPageData = {
  viewerIsAdmin: boolean;
  canManageTargets: boolean;
  yearMonth: string;
  fromYmd: string;
  toYmd: string;
  merchants: MerchantDashboardMerchantOption[];
  selectedMerchantId: string;
  profile: {
    id: string;
    displayName: string;
    email: string | null;
    knownName: string | null;
    couponCodes: string[];
    wholesaleCouponCodes: string[];
  };
  sales: {
    total: number;
    orderCount: number;
    byLocation: Array<{
      locationId: string;
      locationName: string;
      total: number;
      orderCount: number;
    }>;
    hasDmSplit: boolean;
    merTotal: number;
    merOrderCount: number;
    dmTotal: number;
    dmOrderCount: number;
    merTargetPercent: number | null;
    dmTargetPercent: number | null;
    hasWholesale: boolean;
    wholesaleTotal: number;
    wholesaleOrderCount: number;
    wholesaleTargetPercent: number | null;
  };
  target: MerchantDashboardTargetDto;
  wholesaleTarget: MerchantDashboardWholesaleTargetDto | null;
  history: MerchantDashboardHistoryRow[];
  overview: MerchantDashboardOverviewRow[] | null;
  gmPulse: GmPulseInput | null;
  gmAlerts: GmAlert[];
  gmChannelFooter: GmChannelFooter | null;
  viewedMerchantChannelMtd: {
    shop: { orderCount: number; amount: number };
    online: { orderCount: number; amount: number };
  };
  topCustomersToday: Array<{
    key: string;
    name: string;
    phone: string | null;
    email: string | null;
    total: number;
    orderCount: number;
    purchaseDays: number;
  }>;
  topCustomersLifetime: Array<{
    key: string;
    name: string;
    phone: string | null;
    email: string | null;
    total: number;
    orderCount: number;
    purchaseDays: number;
  }>;
  topCustomersTodayYmd: string;
  nearestBirthdays: Array<{
    contactId: string;
    name: string;
    phoneNumber: string | null;
    birthMonth: number;
    birthDay: number | null;
    daysUntil: number;
    assignedMerchant: string | null;
  }>;
  returns: {
    returnOrderCount: number;
    orderCount: number;
    returnRatePct: number | null;
  };
  today: TodaySalesDto;
  peerBoards: PeerBoardsDto;
  locationShare: LocationShareBundle;
  /** Your cosmetics.lk orders only — source / gateway / VAT item split. */
  cosmeticsLkBreakdown: MerchantCosmeticsLkBreakdownBundle;
  /** Day/month attributed sales history (not target-assignment audit). */
  salesHistory: SalesHistoryDto;
  /** Order-placed invoices for selected Colombo day (default today). */
  dailyInvoicesYmd: string;
  dailyInvoices: MerchantDailyInvoiceRow[];
  dailyInvoicesTotal: number;
  dailyInvoicesOrderCount: number;
  showCustomerLists: boolean;
  rangeFromYmd: string;
  rangeToYmd: string;
  loyaltyOutreach: Array<{
    contactId: string;
    name: string;
    phoneNumber: string | null;
    lifetimeTotal: number;
    suggestedTier: "gold" | "platinum";
    suggestionKind: "new" | "upgrade";
    currentAssignedTier: "gold" | "platinum" | null;
    status: string;
    lastContactedAt: string | null;
    missingProfileFields: string[];
  }>;
  callUpdateQueue: CallQueueRowDto[];
  callCenterPerformance: Array<{
    merchantName: string;
    category: string;
    count: number;
  }>;
};

function currentYearMonth(now = new Date()): string {
  return formatAppIsoDate(now).slice(0, 7);
}

function monthBounds(yearMonth: string): { fromYmd: string; toYmd: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const fromYmd = `${yearMonth}-01`;
  const toYmd = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
  return { fromYmd, toYmd };
}

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}

export async function listMerchantRoleUsers(
  companyId: string,
): Promise<MerchantDashboardMerchantOption[]> {
  const roles = await prisma.role.findMany({
    select: { id: true, name: true },
  });
  const merchantRoles = roles.filter((r) => isMerchantRoleName(r.name));
  if (merchantRoles.length === 0) return [];

  const roleIds = merchantRoles.map((r) => r.id);
  const roleNameById = new Map(merchantRoles.map((r) => [r.id, r.name]));

  const users = await prisma.user.findMany({
    where: {
      companyId,
      userRoles: { some: { roleId: { in: roleIds } } },
    },
    orderBy: [{ knownName: "asc" }, { name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      knownName: true,
      name: true,
      email: true,
      userRoles: {
        where: { roleId: { in: roleIds } },
        select: { roleId: true },
      },
    },
  });

  return users.map((user) => ({
    id: user.id,
    displayName: getMerchantDisplayName(user),
    email: user.email,
    roleNames: user.userRoles
      .map((ur) => roleNameById.get(ur.roleId) ?? "")
      .filter(Boolean),
  }));
}

async function loadTargetRow(companyId: string, userId: string, yearMonth: string) {
  return prisma.merchantMonthlyTarget.findUnique({
    where: {
      companyId_userId_yearMonth: { companyId, userId, yearMonth },
    },
    select: {
      targetAmount: true,
      shopTargetAmount: true,
      onlineTargetAmount: true,
      wholesaleTargetAmount: true,
      assignedAt: true,
      assignedBy: {
        select: { knownName: true, name: true, email: true },
      },
    },
  });
}

function buildTargetDto(input: {
  yearMonth: string;
  targetAmount: number | null;
  shopTargetAmount?: number | null;
  onlineTargetAmount?: number | null;
  achievedAmount: number;
  assignedByName: string | null;
  assignedAt: string | null;
  displayName: string;
  isCurrentMonth: boolean;
}): MerchantDashboardTargetDto {
  const percent = getMerchantTargetPercent(
    input.achievedAmount,
    input.targetAmount ?? 0,
  );
  const cheerBand = getMerchantCheerBand(
    input.targetAmount != null && input.targetAmount > 0 ? percent : null,
  );

  let status: MerchantDashboardTargetDto["status"] = "no_target";
  if (input.targetAmount != null && input.targetAmount > 0) {
    if ((percent ?? 0) >= 100) status = "achieved";
    else if (!input.isCurrentMonth) status = "missed";
    else status = "on_track";
  }

  return {
    yearMonth: input.yearMonth,
    targetAmount: input.targetAmount ?? 0,
    shopTargetAmount: input.shopTargetAmount ?? null,
    onlineTargetAmount: input.onlineTargetAmount ?? null,
    achievedAmount: input.achievedAmount,
    percent: input.targetAmount != null && input.targetAmount > 0 ? percent : null,
    status,
    cheerBand,
    cheerMessage: getMerchantCheerMessage(cheerBand, input.displayName),
    assignedByName: input.assignedByName,
    assignedAt: input.assignedAt,
  };
}

export async function getMerchantDashboardPageData(input: {
  companyId: string;
  viewerUserId: string;
  viewerIsAdmin: boolean;
  canManageTargets: boolean;
  selectedMerchantId?: string | null;
  yearMonth?: string | null;
  showCustomerLists?: boolean;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<MerchantDashboardPageData | { error: string; status: number }> {
  const yearMonth =
    input.yearMonth && /^\d{4}-\d{2}$/.test(input.yearMonth)
      ? input.yearMonth
      : currentYearMonth();
  const { fromYmd, toYmd } = monthBounds(yearMonth);
  const todayYmd = formatAppIsoDate(new Date());
  const isCurrentMonth = yearMonth === currentYearMonth();
  const rangeToYmd = isCurrentMonth && todayYmd < toYmd ? todayYmd : toYmd;

  const merchants = await listMerchantRoleUsers(input.companyId);

  let selectedMerchantId = input.selectedMerchantId ?? null;
  if (!input.viewerIsAdmin) {
    selectedMerchantId = input.viewerUserId;
    if (!merchants.some((m) => m.id === selectedMerchantId)) {
      return {
        error: "Your account does not have a merchant role (e.g. merchant-level-01)",
        status: 403,
      };
    }
  } else {
    if (!selectedMerchantId || !merchants.some((m) => m.id === selectedMerchantId)) {
      selectedMerchantId = merchants[0]?.id ?? null;
    }
    if (!selectedMerchantId) {
      return {
        error: "No users with merchant roles found. Assign roles like merchant-level-01 / merchant-level-02 first.",
        status: 404,
      };
    }
  }

  const profileUser = await prisma.user.findFirst({
    where: { id: selectedMerchantId, companyId: input.companyId },
    select: {
      id: true,
      knownName: true,
      name: true,
      email: true,
      couponCodes: true,
      wholesaleCouponCodes: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!profileUser) {
    return { error: "Merchant not found", status: 404 };
  }

  const profileRoleNames = profileUser.userRoles.map((row) => row.role.name);

  const displayName = getMerchantDisplayName(profileUser);

  const cohortUsers = await prisma.user.findMany({
    where: { id: { in: merchants.map((m) => m.id) }, companyId: input.companyId },
    select: { id: true, couponCodes: true, wholesaleCouponCodes: true },
  });
  const couponById = new Map(cohortUsers.map((u) => [u.id, u.couponCodes]));
  const wholesaleCouponById = new Map(
    cohortUsers.map((u) => [u.id, u.wholesaleCouponCodes]),
  );
  const cohortInputs = merchants.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    couponCodes: couponById.get(m.id) ?? [],
    wholesaleCouponCodes: wholesaleCouponById.get(m.id) ?? [],
  }));

  const showCustomerLists = Boolean(input.showCustomerLists);
  const rangeFromYmd =
    input.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(input.fromDate)
      ? input.fromDate
      : fromYmd;
  const chartRangeToYmd =
    input.toDate && /^\d{4}-\d{2}-\d{2}$/.test(input.toDate)
      ? input.toDate
      : rangeToYmd;

  const emptyTop = {
    today: [] as Awaited<
      ReturnType<typeof fetchMerchantTopCustomersBySales>
    >["today"],
    lifetime: [] as Awaited<
      ReturnType<typeof fetchMerchantTopCustomersBySales>
    >["lifetime"],
    todayYmd,
  };

  const [
    mtdCohort,
    todayCohort,
    mtdSales,
    todaySalesSplit,
    salesHistory,
    targetRow,
    historyEvents,
    topCustomersSplit,
    nearestBirthdays,
    dailyInvoicesResult,
    loyaltyOutreach,
    callUpdateQueueResult,
    callCenterRaw,
    cosmeticsLkMtd,
    cosmeticsLkToday,
  ] = await Promise.all([
    fetchMerchantCohortSales(input.companyId, cohortInputs, {
      fromYmd,
      toYmd: rangeToYmd,
      dateType: "all_orders",
    }),
    fetchMerchantCohortSales(input.companyId, cohortInputs, {
      fromYmd: todayYmd,
      toYmd: todayYmd,
      dateType: "all_orders",
    }),
    fetchMerchantUserSales(input.companyId, selectedMerchantId, {
      fromYmd,
      toYmd: rangeToYmd,
      dateType: "all_orders",
    }),
    fetchMerchantUserSales(input.companyId, selectedMerchantId, {
      fromYmd: todayYmd,
      toYmd: todayYmd,
      dateType: "all_orders",
    }),
    fetchMerchantSalesHistory(input.companyId, selectedMerchantId, {
      todayYmd,
      dateType: "all_orders",
    }),
    loadTargetRow(input.companyId, selectedMerchantId, yearMonth),
    prisma.merchantMonthlyTargetHistory.findMany({
      where: { companyId: input.companyId, userId: selectedMerchantId },
      orderBy: [{ yearMonth: "desc" }, { createdAt: "desc" }],
      take: 24,
      select: {
        id: true,
        yearMonth: true,
        targetAmount: true,
        shopTargetAmount: true,
        onlineTargetAmount: true,
        action: true,
        createdAt: true,
        assignedBy: {
          select: { knownName: true, name: true, email: true },
        },
      },
    }),
    showCustomerLists
      ? fetchMerchantTopCustomersBySales(input.companyId, selectedMerchantId, {
          limit: 25,
        })
      : Promise.resolve(emptyTop),
    fetchMerchantNearestBirthdays(input.companyId, profileUser, {
      limit: 15,
      withinDays: 45,
    }),
    fetchMerchantDailyInvoices(input.companyId, selectedMerchantId, {
      dayYmd: todayYmd,
      dateType: "all_orders",
    }),
    fetchMerchantLoyaltyOutreach({
      companyId: input.companyId,
      viewer: {
        knownName: profileUser.knownName,
        name: profileUser.name,
        email: profileUser.email,
        couponCodes: profileUser.couponCodes,
        roleNames: profileRoleNames,
      },
      take: 25,
    }),
    listMerchantCallQueue({
      companyId: input.companyId,
      viewer: {
        id: profileUser.id,
        knownName: profileUser.knownName,
        name: profileUser.name,
        email: profileUser.email,
        couponCodes: profileUser.couponCodes,
        roleNames: profileRoleNames,
      },
    }).then((r) => r.items),
    prisma.$queryRaw<
      Array<{ merchantName: string | null; category: string | null; count: bigint }>
    >`
      SELECT
        "merchantName",
        "category",
        COUNT(*) AS "count"
      FROM "ContactAllocationUpdate"
      WHERE "companyId" = ${input.companyId}
        AND "createdAt" >= ${new Date(`${rangeFromYmd}T00:00:00+05:30`)}
        AND "createdAt" <= ${new Date(`${chartRangeToYmd}T23:59:59.999+05:30`)}
        AND (
          "merchantId" = ${selectedMerchantId}
          OR lower(coalesce("merchantName", '')) = lower(${displayName})
        )
      GROUP BY "merchantName", "category"
      ORDER BY "count" DESC
    `,
    fetchMerchantCosmeticsLkBreakdown(input.companyId, selectedMerchantId, {
      fromYmd,
      toYmd: rangeToYmd,
      dateType: "all_orders",
    }),
    fetchMerchantCosmeticsLkBreakdown(input.companyId, selectedMerchantId, {
      fromYmd: todayYmd,
      toYmd: todayYmd,
      dateType: "all_orders",
    }),
  ]);

  const cosmeticsLkBreakdown: MerchantCosmeticsLkBreakdownBundle = {
    today: cosmeticsLkToday,
    mtd: cosmeticsLkMtd,
  };

  const sales = {
    total: mtdSales.total,
    orderCount: mtdSales.orderCount,
    byLocation: mtdSales.byLocation,
    hasDmSplit: mtdSales.hasDmSplit,
    merTotal: mtdSales.merTotal,
    merOrderCount: mtdSales.merOrderCount,
    dmTotal: mtdSales.dmTotal,
    dmOrderCount: mtdSales.dmOrderCount,
    merTargetPercent: null as number | null,
    dmTargetPercent: null as number | null,
    hasWholesale: mtdSales.hasWholesale,
    wholesaleTotal: mtdSales.wholesaleTotal,
    wholesaleOrderCount: mtdSales.wholesaleOrderCount,
    wholesaleTargetPercent: null as number | null,
  };

  const today: TodaySalesDto = {
    ymd: todayYmd,
    total: todaySalesSplit.total,
    orderCount: todaySalesSplit.orderCount,
    hasDmSplit: todaySalesSplit.hasDmSplit,
    merTotal: todaySalesSplit.merTotal,
    merOrderCount: todaySalesSplit.merOrderCount,
    dmTotal: todaySalesSplit.dmTotal,
    dmOrderCount: todaySalesSplit.dmOrderCount,
  };

  // DM-General merged into DM holders on peer boards and GM scorecard.
  const peerBoardRows = (cohort: typeof mtdCohort) =>
    buildCohortPeerRows(cohort, cohortInputs);

  const peerBoards: PeerBoardsDto = {
    today: buildPeerBoard(peerBoardRows(todayCohort), {
      period: "today",
      fromYmd: todayYmd,
      toYmd: todayYmd,
      viewedMerchantId: selectedMerchantId,
      cheerMessageForBand: getMerchantPeerCheerMessage,
    }),
    mtd: buildPeerBoard(peerBoardRows(mtdCohort), {
      period: "mtd",
      fromYmd,
      toYmd: rangeToYmd,
      viewedMerchantId: selectedMerchantId,
      cheerMessageForBand: getMerchantPeerCheerMessage,
    }),
  };

  const locationShare: LocationShareBundle = {
    today: buildLocationShareRows(todayCohort, selectedMerchantId),
    mtd: buildLocationShareRows(mtdCohort, selectedMerchantId),
  };

  const returns = await fetchMerchantReturnStats(
    input.companyId,
    selectedMerchantId,
    {
      fromYmd,
      toYmd: rangeToYmd,
      orderCount: sales.orderCount,
    },
  );

  // Past-month achieved amounts for target-assignment audit history status
  const pastMonths = [
    ...new Set(
      historyEvents
        .map((h) => h.yearMonth)
        .filter((ym) => ym !== yearMonth && /^\d{4}-\d{2}$/.test(ym)),
    ),
  ].slice(0, 6);

  const pastAchieved = new Map<string, number>();
  await Promise.all(
    pastMonths.map(async (ym) => {
      const bounds = monthBounds(ym);
      const past = await fetchMerchantUserSales(input.companyId, selectedMerchantId!, {
        fromYmd: bounds.fromYmd,
        toYmd: bounds.toYmd,
        dateType: "all_orders",
      });
      pastAchieved.set(ym, past.total);
    }),
  );

  const targetAmount = targetRow ? toNumber(targetRow.targetAmount) : null;
  const shopTargetAmount = targetRow?.shopTargetAmount
    ? toNumber(targetRow.shopTargetAmount)
    : null;
  const onlineTargetAmount = targetRow?.onlineTargetAmount
    ? toNumber(targetRow.onlineTargetAmount)
    : null;
  const effectiveTargetAmount = resolveEffectiveTotalTarget({
    targetAmount,
    shopTargetAmount,
    onlineTargetAmount,
  });
  const target = buildTargetDto({
    yearMonth,
    targetAmount: effectiveTargetAmount,
    shopTargetAmount,
    onlineTargetAmount,
    achievedAmount: sales.total,
    assignedByName: targetRow?.assignedBy
      ? getMerchantDisplayName(targetRow.assignedBy)
      : null,
    assignedAt: targetRow?.assignedAt?.toISOString() ?? null,
    displayName,
    isCurrentMonth,
  });
  if (effectiveTargetAmount != null && effectiveTargetAmount > 0 && sales.hasDmSplit) {
    sales.merTargetPercent = getMerchantTargetPercent(
      sales.merTotal,
      effectiveTargetAmount,
    );
    sales.dmTargetPercent = getMerchantTargetPercent(
      sales.dmTotal,
      effectiveTargetAmount,
    );
  }

  const wholesaleTargetAmount = targetRow?.wholesaleTargetAmount
    ? toNumber(targetRow.wholesaleTargetAmount)
    : null;
  const wholesaleBuilt =
    sales.hasWholesale
      ? buildTargetDto({
          yearMonth,
          targetAmount: wholesaleTargetAmount,
          achievedAmount: sales.wholesaleTotal,
          assignedByName: targetRow?.assignedBy
            ? getMerchantDisplayName(targetRow.assignedBy)
            : null,
          assignedAt: targetRow?.assignedAt?.toISOString() ?? null,
          displayName,
          isCurrentMonth,
        })
      : null;
  const wholesaleTarget: MerchantDashboardWholesaleTargetDto | null = wholesaleBuilt
    ? {
        yearMonth: wholesaleBuilt.yearMonth,
        targetAmount: wholesaleBuilt.targetAmount,
        achievedAmount: wholesaleBuilt.achievedAmount,
        percent: wholesaleBuilt.percent,
        status: wholesaleBuilt.status,
        cheerBand: wholesaleBuilt.cheerBand,
        cheerMessage: wholesaleBuilt.cheerMessage,
        assignedByName: wholesaleBuilt.assignedByName,
        assignedAt: wholesaleBuilt.assignedAt,
      }
    : null;
  if (
    wholesaleTargetAmount != null &&
    wholesaleTargetAmount > 0 &&
    sales.hasWholesale
  ) {
    sales.wholesaleTargetPercent = getMerchantTargetPercent(
      sales.wholesaleTotal,
      wholesaleTargetAmount,
    );
  }

  const history: MerchantDashboardHistoryRow[] = historyEvents.map((event) => {
    const amount = toNumber(event.targetAmount);
    const isCurrent = event.yearMonth === currentYearMonth();
    const achieved =
      event.yearMonth === yearMonth
        ? sales.total
        : (pastAchieved.get(event.yearMonth) ?? null);
    let status: MerchantDashboardHistoryRow["status"] = "unknown";
    if (achieved != null && amount > 0) {
      if (achieved >= amount) status = "achieved";
      else if (isCurrent) status = "in_progress";
      else status = "not_achieved";
    }
    return {
      id: event.id,
      yearMonth: event.yearMonth,
      targetAmount: amount,
      shopTargetAmount: event.shopTargetAmount
        ? toNumber(event.shopTargetAmount)
        : null,
      onlineTargetAmount: event.onlineTargetAmount
        ? toNumber(event.onlineTargetAmount)
        : null,
      achievedAmount: achieved,
      status,
      assignedByName: event.assignedBy
        ? getMerchantDisplayName(event.assignedBy)
        : null,
      assignedAt: event.createdAt.toISOString(),
      action: event.action,
    };
  });

  const viewedMerchantRow = mtdCohort.byMerchant.get(selectedMerchantId);
  const viewedDmRow = mtdCohort.dmBucketId
    ? mtdCohort.byMerchant.get(mtdCohort.dmBucketId)
    : undefined;
  const viewedMerchantChannelMtd = mergeMerchantCohortWithDmBucket({
    merchantRow: viewedMerchantRow,
    dmRow: viewedDmRow,
    dmShare: dmBucketShareForHolder(selectedMerchantId, mtdCohort.dmHolderIds),
  }).channel;

  let overview: MerchantDashboardOverviewRow[] | null = null;
  let gmPulse: GmPulseInput | null = null;
  let gmAlerts: GmAlert[] = [];
  let gmChannelFooter: GmChannelFooter | null = null;
  if (input.viewerIsAdmin) {
    const overviewTargets = await Promise.all(
      merchants.map((m) => loadTargetRow(input.companyId, m.id, yearMonth)),
    );
    const targetsByMerchant = new Map(
      merchants.map((merchant, index) => {
        const tgt = overviewTargets[index];
        const legacy = tgt ? toNumber(tgt.targetAmount) : null;
        const shop = tgt?.shopTargetAmount ? toNumber(tgt.shopTargetAmount) : null;
        const online = tgt?.onlineTargetAmount
          ? toNumber(tgt.onlineTargetAmount)
          : null;
        const wholesale = tgt?.wholesaleTargetAmount
          ? toNumber(tgt.wholesaleTargetAmount)
          : null;
        return [
          merchant.id,
          {
            targetAmount: legacy,
            shopTargetAmount: shop,
            onlineTargetAmount: online,
            wholesaleTargetAmount: wholesale,
          },
        ] as const;
      }),
    );
    const mergeCohortSalesForMerchant = (
      cohort: typeof mtdCohort,
      merchantId: string,
    ) =>
      mergeMerchantCohortWithDmBucket({
        merchantRow: cohort.byMerchant.get(merchantId),
        dmRow: cohort.dmBucketId
          ? cohort.byMerchant.get(cohort.dmBucketId)
          : undefined,
        dmShare: dmBucketShareForHolder(merchantId, mtdCohort.dmHolderIds),
      });

    const mtdSalesByMerchant = new Map(
      merchants.map((merchant) => {
        const merged = mergeCohortSalesForMerchant(mtdCohort, merchant.id);
        return [merchant.id, merged.total] as const;
      }),
    );
    const mtdOrderCountByMerchant = new Map(
      merchants.map((merchant) => {
        const merged = mergeCohortSalesForMerchant(mtdCohort, merchant.id);
        return [merchant.id, merged.orderCount] as const;
      }),
    );
    const todaySalesByMerchant = new Map(
      merchants.map((merchant) => {
        const merged = mergeCohortSalesForMerchant(todayCohort, merchant.id);
        return [merchant.id, merged.total] as const;
      }),
    );
    const periodCohort = await fetchMerchantCohortSales(
      input.companyId,
      cohortInputs,
      {
        fromYmd: rangeFromYmd,
        toYmd: chartRangeToYmd,
        dateType: "all_orders",
      },
    );
    const gm = await buildGmOverview({
      companyId: input.companyId,
      merchants,
      targetsByMerchant,
      periodCohort,
      mtdSalesByMerchant,
      mtdOrderCountByMerchant,
      todaySalesByMerchant,
      yearMonth,
      todayYmd,
      fromYmd: rangeFromYmd,
      toYmd: chartRangeToYmd,
      isCurrentMonth,
      dmHolderIds: periodCohort.dmHolderIds,
    });
    overview = gm.overview;
    gmPulse = gm.pulse;
    gmAlerts = gm.alerts;
    gmChannelFooter = gm.channelFooter;
  }

  return {
    viewerIsAdmin: input.viewerIsAdmin,
    canManageTargets: input.canManageTargets,
    yearMonth,
    fromYmd,
    toYmd: rangeToYmd,
    merchants,
    selectedMerchantId,
    profile: {
      id: profileUser.id,
      displayName,
      email: profileUser.email,
      knownName: profileUser.knownName,
      couponCodes: profileUser.couponCodes,
      wholesaleCouponCodes: profileUser.wholesaleCouponCodes,
    },
    sales: {
      total: sales.total,
      orderCount: sales.orderCount,
      byLocation: sales.byLocation,
      hasDmSplit: sales.hasDmSplit,
      merTotal: sales.merTotal,
      merOrderCount: sales.merOrderCount,
      dmTotal: sales.dmTotal,
      dmOrderCount: sales.dmOrderCount,
      merTargetPercent: sales.merTargetPercent,
      dmTargetPercent: sales.dmTargetPercent,
      hasWholesale: sales.hasWholesale,
      wholesaleTotal: sales.wholesaleTotal,
      wholesaleOrderCount: sales.wholesaleOrderCount,
      wholesaleTargetPercent: sales.wholesaleTargetPercent,
    },
    target,
    wholesaleTarget,
    history,
    overview,
    gmPulse,
    gmAlerts,
    gmChannelFooter,
    viewedMerchantChannelMtd,
    topCustomersToday: topCustomersSplit.today,
    topCustomersLifetime: topCustomersSplit.lifetime,
    topCustomersTodayYmd: topCustomersSplit.todayYmd,
    nearestBirthdays,
    returns,
    today,
    peerBoards,
    locationShare,
    cosmeticsLkBreakdown,
    salesHistory,
    dailyInvoicesYmd: dailyInvoicesResult.dayYmd,
    dailyInvoices: dailyInvoicesResult.rows,
    dailyInvoicesTotal: dailyInvoicesResult.total,
    dailyInvoicesOrderCount: dailyInvoicesResult.orderCount,
    showCustomerLists,
    rangeFromYmd,
    rangeToYmd: chartRangeToYmd,
    loyaltyOutreach,
    callUpdateQueue: callUpdateQueueResult,
    callCenterPerformance: callCenterRaw.map((row) => ({
      merchantName: normalizeDashboardMerchantLabel(
        canonicalizeMerchantDisplayName(row.merchantName)
      ),
      category: row.category ?? "N/A",
      count: Number(row.count),
    })),
  };
}

export async function upsertMerchantMonthlyTarget(input: {
  companyId: string;
  merchantUserId: string;
  yearMonth: string;
  targetAmount?: number;
  shopTargetAmount?: number | null;
  onlineTargetAmount?: number | null;
  wholesaleTargetAmount?: number | null;
  assignedByUserId: string;
  note?: string | null;
}) {
  const existing = await prisma.merchantMonthlyTarget.findUnique({
    where: {
      companyId_userId_yearMonth: {
        companyId: input.companyId,
        userId: input.merchantUserId,
        yearMonth: input.yearMonth,
      },
    },
    select: {
      id: true,
      targetAmount: true,
      shopTargetAmount: true,
      onlineTargetAmount: true,
      wholesaleTargetAmount: true,
    },
  });

  const action = existing ? "update" : "set";
  const regularFieldsProvided =
    input.targetAmount !== undefined ||
    input.shopTargetAmount !== undefined ||
    input.onlineTargetAmount !== undefined;
  const wholesaleProvided = input.wholesaleTargetAmount !== undefined;

  if (!regularFieldsProvided && !wholesaleProvided) {
    throw new Error("No target fields provided");
  }

  const shop =
    input.shopTargetAmount !== undefined
      ? input.shopTargetAmount
      : existing?.shopTargetAmount != null
        ? toNumber(existing.shopTargetAmount)
        : null;
  const online =
    input.onlineTargetAmount !== undefined
      ? input.onlineTargetAmount
      : existing?.onlineTargetAmount != null
        ? toNumber(existing.onlineTargetAmount)
        : null;

  let amountDecimal: Prisma.Decimal;
  if (regularFieldsProvided) {
    const resolvedTotal = resolveEffectiveTotalTarget({
      targetAmount:
        input.targetAmount ??
        (existing ? toNumber(existing.targetAmount) : null),
      shopTargetAmount: shop,
      onlineTargetAmount: online,
    });
    if (resolvedTotal == null || resolvedTotal <= 0) {
      throw new Error("Target amount must be positive");
    }
    amountDecimal = new Prisma.Decimal(resolvedTotal);
  } else if (existing) {
    amountDecimal = existing.targetAmount;
  } else {
    amountDecimal = new Prisma.Decimal(0);
  }

  const shopDecimal =
    shop != null && shop > 0 ? new Prisma.Decimal(shop) : null;
  const onlineDecimal =
    online != null && online > 0 ? new Prisma.Decimal(online) : null;

  const wholesale =
    input.wholesaleTargetAmount !== undefined
      ? input.wholesaleTargetAmount
      : existing?.wholesaleTargetAmount != null
        ? toNumber(existing.wholesaleTargetAmount)
        : null;
  const wholesaleDecimal =
    wholesale != null && wholesale > 0 ? new Prisma.Decimal(wholesale) : null;

  if (wholesaleProvided && wholesale != null && wholesale <= 0) {
    throw new Error("Wholesale target amount must be positive");
  }

  const [target] = await prisma.$transaction([
    prisma.merchantMonthlyTarget.upsert({
      where: {
        companyId_userId_yearMonth: {
          companyId: input.companyId,
          userId: input.merchantUserId,
          yearMonth: input.yearMonth,
        },
      },
      create: {
        companyId: input.companyId,
        userId: input.merchantUserId,
        yearMonth: input.yearMonth,
        targetAmount: amountDecimal,
        shopTargetAmount: shopDecimal,
        onlineTargetAmount: onlineDecimal,
        wholesaleTargetAmount: wholesaleDecimal,
        assignedByUserId: input.assignedByUserId,
        assignedAt: new Date(),
        note: input.note ?? null,
      },
      update: {
        ...(regularFieldsProvided
          ? {
              targetAmount: amountDecimal,
              shopTargetAmount: shopDecimal,
              onlineTargetAmount: onlineDecimal,
            }
          : {}),
        ...(wholesaleProvided ? { wholesaleTargetAmount: wholesaleDecimal } : {}),
        assignedByUserId: input.assignedByUserId,
        assignedAt: new Date(),
        note: input.note ?? null,
      },
    }),
    prisma.merchantMonthlyTargetHistory.create({
      data: {
        companyId: input.companyId,
        userId: input.merchantUserId,
        yearMonth: input.yearMonth,
        targetAmount: amountDecimal,
        shopTargetAmount: shopDecimal,
        onlineTargetAmount: onlineDecimal,
        wholesaleTargetAmount: wholesaleDecimal,
        action,
        assignedByUserId: input.assignedByUserId,
        note: input.note ?? null,
      },
    }),
  ]);

  return { target, action };
}
