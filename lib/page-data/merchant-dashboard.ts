import { Prisma } from "@prisma/client";

import {
  getMerchantCheerBand,
  getMerchantCheerMessage,
  getMerchantTargetPercent,
  type MerchantCheerBand,
} from "@/lib/merchant-dashboard/cheer";
import { getMerchantDisplayName } from "@/lib/merchant-groups";
import { isMerchantRoleName } from "@/lib/merchant-role";
import { fetchMerchantUserSales, fetchMerchantTopCustomersBySales, fetchMerchantReturnStats } from "@/lib/page-data/merchant-dashboard-sales";
import { formatAppIsoDate } from "@/lib/format-datetime";
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
  };
  target: MerchantDashboardTargetDto;
  history: MerchantDashboardHistoryRow[];
  overview: MerchantDashboardOverviewRow[] | null;
  topCustomers: Array<{
    key: string;
    name: string;
    phone: string | null;
    email: string | null;
    total: number;
    orderCount: number;
  }>;
  returns: {
    returnOrderCount: number;
    orderCount: number;
    returnRatePct: number | null;
  };
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

  const [sales, targetRow, historyEvents, overviewSales, topCustomers] = await Promise.all([
    fetchMerchantUserSales(input.companyId, selectedMerchantId, {
      fromYmd,
      toYmd: rangeToYmd,
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
    input.viewerIsAdmin
      ? Promise.all(
          merchants.map(async (m) => {
            const [mtd, tgt] = await Promise.all([
              fetchMerchantUserSales(input.companyId, m.id, {
                fromYmd,
                toYmd: rangeToYmd,
                dateType: "all_orders",
              }),
              loadTargetRow(input.companyId, m.id, yearMonth),
            ]);
            return { merchant: m, mtd, tgt };
          }),
        )
      : Promise.resolve(null),
    fetchMerchantTopCustomersBySales(input.companyId, selectedMerchantId, {
      limit: 10,
    }),
  ]);

  const returns = await fetchMerchantReturnStats(
    input.companyId,
    selectedMerchantId,
    {
      fromYmd,
      toYmd: rangeToYmd,
      orderCount: sales.orderCount,
    },
  );

  // Past-month achieved amounts for history status
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

  const overview: MerchantDashboardOverviewRow[] | null = overviewSales
    ? overviewSales.map(({ merchant, mtd, tgt }) => {
        const tgtAmount = tgt ? toNumber(tgt.targetAmount) : null;
        const percent = getMerchantTargetPercent(mtd.total, tgtAmount ?? 0);
        let status: MerchantDashboardOverviewRow["status"] = "no_target";
        if (tgtAmount != null && tgtAmount > 0) {
          status = (percent ?? 0) >= 100 ? "achieved" : "behind";
        }
        return {
          merchantId: merchant.id,
          displayName: merchant.displayName,
          targetAmount: tgtAmount,
          mtdSales: mtd.total,
          percent: tgtAmount != null && tgtAmount > 0 ? percent : null,
          status,
        };
      })
    : null;

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
    },
    target,
    history,
    overview,
    topCustomers,
    returns,
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
