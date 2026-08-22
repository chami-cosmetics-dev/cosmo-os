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
import { buildPeerBoard, type PeerBoardInputRow } from "@/lib/merchant-dashboard/peer-board";
import { getMerchantDisplayName } from "@/lib/merchant-groups";
import { normalizeDashboardMerchantLabel } from "@/lib/merchant-dm-sales";
import { isMerchantRoleName } from "@/lib/merchant-role";
import { fetchMerchantNearestBirthdays } from "@/lib/page-data/merchant-dashboard-birthdays";
import { fetchMerchantLoyaltyOutreach } from "@/lib/page-data/merchant-dashboard-loyalty";
import { fetchMerchantSalesHistory } from "@/lib/page-data/merchant-dashboard-history";
import {
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
import { prisma } from "@/lib/prisma";

export type MerchantDashboardMerchantOption = {
  id: string;
  displayName: string;
  email: string | null;
  roleNames: string[];
};

export type MerchantDashboardTargetDto = {
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
  achievedAmount: number | null;
  status: "achieved" | "not_achieved" | "in_progress" | "unknown";
  assignedByName: string | null;
  assignedAt: string | null;
  action: string;
};

export type MerchantDashboardOverviewRow = {
  merchantId: string;
  displayName: string;
  targetAmount: number | null;
  mtdSales: number;
  percent: number | null;
  status: "achieved" | "behind" | "no_target";
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
  };
  target: MerchantDashboardTargetDto;
  history: MerchantDashboardHistoryRow[];
  overview: MerchantDashboardOverviewRow[] | null;
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
    },
  });
  if (!profileUser) {
    return { error: "Merchant not found", status: 404 };
  }

  const displayName = getMerchantDisplayName(profileUser);

  const cohortUsers = await prisma.user.findMany({
    where: { id: { in: merchants.map((m) => m.id) }, companyId: input.companyId },
    select: { id: true, couponCodes: true },
  });
  const couponById = new Map(cohortUsers.map((u) => [u.id, u.couponCodes]));
  const cohortInputs = merchants.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    couponCodes: couponById.get(m.id) ?? [],
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

  // Merchants race on podium; DM-General still on share/ranked sales charts.
  const peerBoardRows = (cohort: typeof mtdCohort): PeerBoardInputRow[] => {
    const rows: PeerBoardInputRow[] = merchants.map((m) => {
      const row = cohort.byMerchant.get(m.id);
      return {
        merchantId: m.id,
        displayName: m.displayName,
        total: row?.total ?? 0,
        orderCount: row?.orderCount ?? 0,
      };
    });
    if (cohort.dmBucketId) {
      const dm = cohort.byMerchant.get(cohort.dmBucketId);
      rows.push({
        merchantId: cohort.dmBucketId,
        displayName: dm?.displayName ?? "DM-General",
        total: dm?.total ?? 0,
        orderCount: dm?.orderCount ?? 0,
        excludeFromRace: true,
      });
    }
    return rows;
  };

  const peerBoards: PeerBoardsDto = {
    today: buildPeerBoard(peerBoardRows(todayCohort), {
      period: "today",
      fromYmd: todayYmd,
      toYmd: todayYmd,
      viewedMerchantId: selectedMerchantId,
      alwaysIncludeMerchantIds: todayCohort.dmBucketId
        ? [todayCohort.dmBucketId]
        : undefined,
      cheerMessageForBand: getMerchantPeerCheerMessage,
    }),
    mtd: buildPeerBoard(peerBoardRows(mtdCohort), {
      period: "mtd",
      fromYmd,
      toYmd: rangeToYmd,
      viewedMerchantId: selectedMerchantId,
      alwaysIncludeMerchantIds: mtdCohort.dmBucketId
        ? [mtdCohort.dmBucketId]
        : undefined,
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
  const target = buildTargetDto({
    yearMonth,
    targetAmount,
    achievedAmount: sales.total,
    assignedByName: targetRow?.assignedBy
      ? getMerchantDisplayName(targetRow.assignedBy)
      : null,
    assignedAt: targetRow?.assignedAt?.toISOString() ?? null,
    displayName,
    isCurrentMonth,
  });

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
      achievedAmount: achieved,
      status,
      assignedByName: event.assignedBy
        ? getMerchantDisplayName(event.assignedBy)
        : null,
      assignedAt: event.createdAt.toISOString(),
      action: event.action,
    };
  });

  let overview: MerchantDashboardOverviewRow[] | null = null;
  if (input.viewerIsAdmin) {
    const overviewTargets = await Promise.all(
      merchants.map((m) => loadTargetRow(input.companyId, m.id, yearMonth)),
    );
    overview = merchants.map((merchant, index) => {
      const mtd = mtdCohort.byMerchant.get(merchant.id);
      const tgt = overviewTargets[index];
      const tgtAmount = tgt ? toNumber(tgt.targetAmount) : null;
      const mtdSales = mtd?.total ?? 0;
      const percent = getMerchantTargetPercent(mtdSales, tgtAmount ?? 0);
      let status: MerchantDashboardOverviewRow["status"] = "no_target";
      if (tgtAmount != null && tgtAmount > 0) {
        status = (percent ?? 0) >= 100 ? "achieved" : "behind";
      }
      return {
        merchantId: merchant.id,
        displayName: merchant.displayName,
        targetAmount: tgtAmount,
        mtdSales,
        percent: tgtAmount != null && tgtAmount > 0 ? percent : null,
        status,
      };
    });
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
    },
    target,
    history,
    overview,
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
      merchantName: normalizeDashboardMerchantLabel(row.merchantName),
      category: row.category ?? "N/A",
      count: Number(row.count),
    })),
  };
}

export async function upsertMerchantMonthlyTarget(input: {
  companyId: string;
  merchantUserId: string;
  yearMonth: string;
  targetAmount: number;
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
    select: { id: true },
  });

  const action = existing ? "update" : "set";
  const amount = new Prisma.Decimal(input.targetAmount);

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
        targetAmount: amount,
        assignedByUserId: input.assignedByUserId,
        assignedAt: new Date(),
        note: input.note ?? null,
      },
      update: {
        targetAmount: amount,
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
        targetAmount: amount,
        action,
        assignedByUserId: input.assignedByUserId,
        note: input.note ?? null,
      },
    }),
  ]);

  return { target, action };
}
