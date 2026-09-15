import { Prisma } from "@prisma/client";

import {
  CALL_CENTER_CATEGORY_VALUES,
  CALL_CENTER_CONTACTED_CATEGORY,
  sortCallCenterCategories,
} from "@/lib/contact-call-center-categories";
import {
  formatAppDateShort,
  formatAppDateTime,
  formatAppIsoDate,
} from "@/lib/format-datetime";
import { sendCallCenterWeeklyReportEmail } from "@/lib/maileroo";
import { mergeMerchantCohortWithDmBucket } from "@/lib/merchant-dashboard/channel-sales";
import { dmBucketShareForHolder } from "@/lib/merchant-dm-sales";
import {
  labelCallCenterPerformanceMerchant,
  parseCallCenterDayEnd,
  parseCallCenterDayStart,
} from "@/lib/page-data/call-center-performance";
import {
  ensureMerchantTargetsCarriedForward,
  listMerchantRoleUsers,
} from "@/lib/page-data/merchant-dashboard";
import { fetchMerchantCohortSales } from "@/lib/page-data/merchant-dashboard-peers";
import { prisma } from "@/lib/prisma";

const REPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cosmetics.lk call-center performance recipients.
 */
export const CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS = [
  "asitha@cosmetics.lk",
  "chami@cosmetics.lk",
  "careers@cosmetics.lk",
  "teshani.cosmetics@outlook.com",
];

/** @deprecated Use CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS */
export const CALL_CENTER_WEEKLY_EMAIL_RECIPIENTS =
  CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS;

export type CallCenterReportMode = "daily" | "weekly";

export type CallCenterPerformanceEmailSource = "cron" | "manual";

export type CallCenterPerformanceEmailSendStatus =
  | "sent"
  | "failed"
  | "skipped_no_recipients"
  | "skipped_no_company";

export type CallCenterMerchantLoyaltyRow = {
  merchantId: string | null;
  merchantName: string;
  primaryPlatinum: number;
  primaryGold: number;
  primaryOther: number;
  primaryTotal: number;
  secondaryPlatinum: number;
  secondaryGold: number;
  secondaryOther: number;
  secondaryTotal: number;
};

export type CallCenterMerchantOutcomeRow = {
  merchantId: string | null;
  merchantName: string;
  primaryByCategory: Record<string, number>;
  secondaryByCategory: Record<string, number>;
  primaryTotal: number;
  secondaryTotal: number;
};

export type CallCenterChannelTargetRow = {
  merchantId: string;
  merchantName: string;
  dayShopActual: number;
  dayOnlineActual: number;
  shopTarget: number | null;
  shopActual: number;
  onlineTarget: number | null;
  onlineActual: number;
};

export type CallCenterPerformanceReportSnapshot = {
  mode: CallCenterReportMode;
  companyId: string;
  companyName: string;
  asOfYmd: string;
  primaryFromYmd: string;
  primaryToYmd: string;
  secondaryFromYmd: string;
  secondaryToYmd: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryColumn: string;
  secondaryColumn: string;
  generatedAt: string;
  loyaltyRows: CallCenterMerchantLoyaltyRow[];
  loyaltyTotals: CallCenterMerchantLoyaltyRow;
  outcomeRows: CallCenterMerchantOutcomeRow[];
  outcomeCategories: string[];
  outcomeTotals: CallCenterMerchantOutcomeRow;
  channelRows: CallCenterChannelTargetRow[];
  channelTotals: CallCenterChannelTargetRow | null;
  subject: string;
  htmlBody: string;
  plainBody: string;
};

type TierBucket = "platinum" | "gold" | "other";

type RawTierRow = {
  merchantId: string | null;
  orphanName: string;
  tier: TierBucket;
  count: number;
};

type RawCategoryRow = {
  merchantId: string | null;
  orphanName: string;
  category: string;
  count: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLkr(value: number | null): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString("en-LK", { maximumFractionDigits: 0 });
}

export function isValidReportDate(value: string): boolean {
  if (!REPORT_DATE_RE.test(value)) return false;
  const d = parseCallCenterDayStart(value);
  return !Number.isNaN(d.getTime()) && formatAppIsoDate(d) === value;
}

/** Previous calendar day in Asia/Colombo as YYYY-MM-DD. */
export function getPreviousColomboReportDate(now = new Date()): string {
  const today = formatAppIsoDate(now);
  const start = parseCallCenterDayStart(today);
  const prev = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  return formatAppIsoDate(prev);
}

/** Monday YYYY-MM-DD for the Colombo week that contains `ymd`. */
export function weekStartMondayYmd(ymd: string): string {
  const noon = new Date(`${ymd}T12:00:00.000+05:30`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    weekday: "short",
  }).format(noon);
  const offsetFromMonday: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const daysBack = offsetFromMonday[weekday] ?? 0;
  const monday = new Date(noon.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return formatAppIsoDate(monday);
}

export function monthStartYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function emptyLoyaltyRow(
  merchantId: string | null,
  merchantName: string,
): CallCenterMerchantLoyaltyRow {
  return {
    merchantId,
    merchantName,
    primaryPlatinum: 0,
    primaryGold: 0,
    primaryOther: 0,
    primaryTotal: 0,
    secondaryPlatinum: 0,
    secondaryGold: 0,
    secondaryOther: 0,
    secondaryTotal: 0,
  };
}

function emptyOutcomeRow(
  merchantId: string | null,
  merchantName: string,
): CallCenterMerchantOutcomeRow {
  return {
    merchantId,
    merchantName,
    primaryByCategory: {},
    secondaryByCategory: {},
    primaryTotal: 0,
    secondaryTotal: 0,
  };
}

function merchantKey(merchantId: string | null, orphanName: string): string {
  return merchantId ? `id:${merchantId}` : `name:${orphanName.trim().toLowerCase()}`;
}

function normalizeTier(raw: string | null): TierBucket {
  const tier = (raw ?? "").trim().toLowerCase();
  if (tier === "platinum") return "platinum";
  if (tier === "gold") return "gold";
  return "other";
}

function formatDisplayRange(fromYmd: string, toYmd: string): string {
  const from = formatAppDateShort(`${fromYmd}T12:00:00+05:30`);
  const to = formatAppDateShort(`${toYmd}T12:00:00+05:30`);
  if (fromYmd === toYmd) return from;
  return `${from} – ${to}`;
}

function formatDisplayDay(ymd: string): string {
  return formatAppDateShort(`${ymd}T12:00:00+05:30`);
}

async function fetchTierRows(input: {
  companyId: string;
  fromYmd: string;
  toYmd: string;
}): Promise<RawTierRow[]> {
  const fromDate = parseCallCenterDayStart(input.fromYmd);
  const toDate = parseCallCenterDayEnd(input.toYmd);
  const rows = await prisma.$queryRaw<
    Array<{
      merchantId: string | null;
      orphanName: string | null;
      tier: string | null;
      count: bigint;
    }>
  >(Prisma.sql`
    SELECT
      cau."merchantId",
      CASE
        WHEN cau."merchantId" IS NULL THEN COALESCE(cau."merchantName", '')
        ELSE ''
      END AS "orphanName",
      CASE
        WHEN LOWER(TRIM(COALESCE(cm."loyaltyAssignedTier", ''))) = 'platinum' THEN 'platinum'
        WHEN LOWER(TRIM(COALESCE(cm."loyaltyAssignedTier", ''))) = 'gold' THEN 'gold'
        ELSE 'other'
      END AS tier,
      COUNT(*)::bigint AS "count"
    FROM "ContactAllocationUpdate" cau
    LEFT JOIN "ContactMaster" cm ON cm.id = cau."contactId"
    WHERE cau."companyId" = ${input.companyId}
      AND cau."createdAt" >= ${fromDate}
      AND cau."createdAt" <= ${toDate}
      AND cau."category" IS DISTINCT FROM 'allocation'
    GROUP BY
      cau."merchantId",
      CASE
        WHEN cau."merchantId" IS NULL THEN COALESCE(cau."merchantName", '')
        ELSE ''
      END,
      3
  `);

  return rows.map((row) => ({
    merchantId: row.merchantId,
    orphanName: row.orphanName ?? "",
    tier: normalizeTier(row.tier),
    count: Number(row.count),
  }));
}

async function fetchCategoryRows(input: {
  companyId: string;
  fromYmd: string;
  toYmd: string;
}): Promise<RawCategoryRow[]> {
  const fromDate = parseCallCenterDayStart(input.fromYmd);
  const toDate = parseCallCenterDayEnd(input.toYmd);
  const rows = await prisma.$queryRaw<
    Array<{
      merchantId: string | null;
      orphanName: string | null;
      category: string | null;
      count: bigint;
    }>
  >(Prisma.sql`
    SELECT
      cau."merchantId",
      CASE
        WHEN cau."merchantId" IS NULL THEN COALESCE(cau."merchantName", '')
        ELSE ''
      END AS "orphanName",
      cau."category",
      COUNT(*)::bigint AS "count"
    FROM "ContactAllocationUpdate" cau
    WHERE cau."companyId" = ${input.companyId}
      AND cau."createdAt" >= ${fromDate}
      AND cau."createdAt" <= ${toDate}
      AND cau."category" IS DISTINCT FROM 'allocation'
    GROUP BY
      cau."merchantId",
      CASE
        WHEN cau."merchantId" IS NULL THEN COALESCE(cau."merchantName", '')
        ELSE ''
      END,
      cau."category"
  `);

  return rows.map((row) => ({
    merchantId: row.merchantId,
    orphanName: row.orphanName ?? "",
    category: row.category ?? "N/A",
    count: Number(row.count),
  }));
}

async function resolveMerchantLabels(
  rows: Array<{ merchantId: string | null; orphanName: string }>,
): Promise<Map<string, string>> {
  const merchantIds = [
    ...new Set(
      rows
        .map((row) => row.merchantId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const users =
    merchantIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: merchantIds } },
          select: {
            id: true,
            knownName: true,
            name: true,
            email: true,
          },
        });
  const userById = new Map(users.map((user) => [user.id, user]));
  const labels = new Map<string, string>();
  for (const row of rows) {
    const key = merchantKey(row.merchantId, row.orphanName);
    if (labels.has(key)) continue;
    labels.set(
      key,
      labelCallCenterPerformanceMerchant({
        user: row.merchantId ? (userById.get(row.merchantId) ?? null) : null,
        orphanName: row.orphanName,
      }),
    );
  }
  return labels;
}

function applyTierCounts(
  target: CallCenterMerchantLoyaltyRow,
  period: "primary" | "secondary",
  tier: TierBucket,
  count: number,
) {
  if (period === "primary") {
    if (tier === "platinum") target.primaryPlatinum += count;
    else if (tier === "gold") target.primaryGold += count;
    else target.primaryOther += count;
    target.primaryTotal += count;
  } else {
    if (tier === "platinum") target.secondaryPlatinum += count;
    else if (tier === "gold") target.secondaryGold += count;
    else target.secondaryOther += count;
    target.secondaryTotal += count;
  }
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

async function fetchChannelTargetRows(input: {
  companyId: string;
  asOfYmd: string;
}): Promise<{
  rows: CallCenterChannelTargetRow[];
  totals: CallCenterChannelTargetRow;
}> {
  const yearMonth = input.asOfYmd.slice(0, 7);
  const mtdFrom = monthStartYmd(input.asOfYmd);
  const merchants = await listMerchantRoleUsers(input.companyId);
  if (merchants.length === 0) {
    return {
      rows: [],
      totals: {
        merchantId: "",
        merchantName: "ALL",
        dayShopActual: 0,
        dayOnlineActual: 0,
        shopTarget: null,
        shopActual: 0,
        onlineTarget: null,
        onlineActual: 0,
      },
    };
  }

  await ensureMerchantTargetsCarriedForward({
    companyId: input.companyId,
    yearMonth,
    merchantUserIds: merchants.map((m) => m.id),
  });

  const [cohortUsers, targets] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: merchants.map((m) => m.id) }, companyId: input.companyId },
      select: { id: true, couponCodes: true, wholesaleCouponCodes: true },
    }),
    prisma.merchantMonthlyTarget.findMany({
      where: {
        companyId: input.companyId,
        yearMonth,
        userId: { in: merchants.map((m) => m.id) },
      },
      select: {
        userId: true,
        shopTargetAmount: true,
        onlineTargetAmount: true,
      },
    }),
  ]);

  const couponById = new Map(cohortUsers.map((u) => [u.id, u.couponCodes]));
  const wholesaleById = new Map(
    cohortUsers.map((u) => [u.id, u.wholesaleCouponCodes]),
  );
  const targetById = new Map(targets.map((t) => [t.userId, t]));

  const cohortInputs = merchants.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    couponCodes: couponById.get(m.id) ?? [],
    wholesaleCouponCodes: wholesaleById.get(m.id) ?? [],
  }));

  const [mtdCohort, dayCohort] = await Promise.all([
    fetchMerchantCohortSales(input.companyId, cohortInputs, {
      fromYmd: mtdFrom,
      toYmd: input.asOfYmd,
      dateType: "all_orders",
    }),
    fetchMerchantCohortSales(input.companyId, cohortInputs, {
      fromYmd: input.asOfYmd,
      toYmd: input.asOfYmd,
      dateType: "all_orders",
    }),
  ]);

  const rows: CallCenterChannelTargetRow[] = merchants.map((merchant) => {
    const mtdMerged = mergeMerchantCohortWithDmBucket({
      merchantRow: mtdCohort.byMerchant.get(merchant.id),
      dmRow: mtdCohort.dmBucketId
        ? mtdCohort.byMerchant.get(mtdCohort.dmBucketId)
        : undefined,
      dmShare: dmBucketShareForHolder(merchant.id, mtdCohort.dmHolderIds),
    });
    const dayMerged = mergeMerchantCohortWithDmBucket({
      merchantRow: dayCohort.byMerchant.get(merchant.id),
      dmRow: dayCohort.dmBucketId
        ? dayCohort.byMerchant.get(dayCohort.dmBucketId)
        : undefined,
      dmShare: dmBucketShareForHolder(merchant.id, dayCohort.dmHolderIds),
    });
    const tgt = targetById.get(merchant.id);
    const shopTarget =
      tgt?.shopTargetAmount != null ? toNumber(tgt.shopTargetAmount) : null;
    const onlineTarget =
      tgt?.onlineTargetAmount != null ? toNumber(tgt.onlineTargetAmount) : null;
    return {
      merchantId: merchant.id,
      merchantName: merchant.displayName,
      dayShopActual: dayMerged.channel.shop.amount,
      dayOnlineActual: dayMerged.channel.online.amount,
      shopTarget: shopTarget != null && shopTarget > 0 ? shopTarget : null,
      shopActual: mtdMerged.channel.shop.amount,
      onlineTarget: onlineTarget != null && onlineTarget > 0 ? onlineTarget : null,
      onlineActual: mtdMerged.channel.online.amount,
    };
  });

  rows.sort(
    (a, b) =>
      b.dayShopActual +
        b.dayOnlineActual -
        (a.dayShopActual + a.dayOnlineActual) ||
      b.shopActual + b.onlineActual - (a.shopActual + a.onlineActual) ||
      a.merchantName.localeCompare(b.merchantName),
  );

  const totals: CallCenterChannelTargetRow = {
    merchantId: "",
    merchantName: "ALL",
    dayShopActual: rows.reduce((s, r) => s + r.dayShopActual, 0),
    dayOnlineActual: rows.reduce((s, r) => s + r.dayOnlineActual, 0),
    shopTarget: rows.reduce(
      (s, r) => (r.shopTarget != null ? (s ?? 0) + r.shopTarget : s),
      null as number | null,
    ),
    shopActual: rows.reduce((s, r) => s + r.shopActual, 0),
    onlineTarget: rows.reduce(
      (s, r) => (r.onlineTarget != null ? (s ?? 0) + r.onlineTarget : s),
      null as number | null,
    ),
    onlineActual: rows.reduce((s, r) => s + r.onlineActual, 0),
  };

  return { rows, totals };
}

function buildHtml(snapshot: {
  mode: CallCenterReportMode;
  companyName: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryColumn: string;
  secondaryColumn: string;
  generatedAt: string;
  loyaltyRows: CallCenterMerchantLoyaltyRow[];
  loyaltyTotals: CallCenterMerchantLoyaltyRow;
  outcomeRows: CallCenterMerchantOutcomeRow[];
  outcomeCategories: string[];
  outcomeTotals: CallCenterMerchantOutcomeRow;
  channelRows: CallCenterChannelTargetRow[];
  channelTotals: CallCenterChannelTargetRow | null;
}): string {
  const p = snapshot.primaryColumn;
  const s = snapshot.secondaryColumn;

  const loyaltyBody = snapshot.loyaltyRows
    .map(
      (row) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(row.merchantName)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.primaryPlatinum}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.primaryGold}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.primaryOther}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;"><strong>${row.primaryTotal}</strong></td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.secondaryPlatinum}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.secondaryGold}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.secondaryOther}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;"><strong>${row.secondaryTotal}</strong></td>
      </tr>`,
    )
    .join("");

  const lt = snapshot.loyaltyTotals;
  const loyaltyFooter = `
      <tr style="background:#f3f4f6;font-weight:600;">
        <td style="padding:8px;border:1px solid #ddd;">ALL</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${lt.primaryPlatinum}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${lt.primaryGold}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${lt.primaryOther}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${lt.primaryTotal}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${lt.secondaryPlatinum}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${lt.secondaryGold}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${lt.secondaryOther}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${lt.secondaryTotal}</td>
      </tr>`;

  const outcomeHeader = snapshot.outcomeCategories
    .map(
      (cat) =>
        `<th style="padding:8px;border:1px solid #ddd;text-align:right;">${escapeHtml(p)} ${escapeHtml(cat)}</th>
         <th style="padding:8px;border:1px solid #ddd;text-align:right;">${escapeHtml(s)} ${escapeHtml(cat)}</th>`,
    )
    .join("");

  const outcomeBody = snapshot.outcomeRows
    .map((row) => {
      const cells = snapshot.outcomeCategories
        .map((cat) => {
          const primary = row.primaryByCategory[cat] ?? 0;
          const secondary = row.secondaryByCategory[cat] ?? 0;
          return `<td style="padding:8px;border:1px solid #ddd;text-align:right;">${primary}</td>
                  <td style="padding:8px;border:1px solid #ddd;text-align:right;">${secondary}</td>`;
        })
        .join("");
      return `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(row.merchantName)}</td>
        ${cells}
        <td style="padding:8px;border:1px solid #ddd;text-align:right;"><strong>${row.primaryTotal}</strong></td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;"><strong>${row.secondaryTotal}</strong></td>
      </tr>`;
    })
    .join("");

  const outcomeTotalCells = snapshot.outcomeCategories
    .map((cat) => {
      const primary = snapshot.outcomeTotals.primaryByCategory[cat] ?? 0;
      const secondary = snapshot.outcomeTotals.secondaryByCategory[cat] ?? 0;
      return `<td style="padding:8px;border:1px solid #ddd;text-align:right;">${primary}</td>
              <td style="padding:8px;border:1px solid #ddd;text-align:right;">${secondary}</td>`;
    })
    .join("");

  const outcomeFooter = `
      <tr style="background:#f3f4f6;font-weight:600;">
        <td style="padding:8px;border:1px solid #ddd;">ALL</td>
        ${outcomeTotalCells}
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${snapshot.outcomeTotals.primaryTotal}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${snapshot.outcomeTotals.secondaryTotal}</td>
      </tr>`;

  const channelSection =
    snapshot.mode === "daily" && snapshot.channelTotals
      ? `
  <h2 style="font-size:16px;margin:28px 0 8px;">3) Merchant × day sales (shop / online)</h2>
  <p style="margin:0 0 8px;color:#666;font-size:13px;">Day sales only — shop = POS, online = web/other (same split as Merchant Dashboard).</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead>
      <tr style="background:#111;color:#fff;">
        <th style="padding:8px;border:1px solid #333;text-align:left;">Merchant</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">Day shop</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">Day online</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">Day total</th>
      </tr>
    </thead>
    <tbody>
      ${snapshot.channelRows
        .map(
          (row) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(row.merchantName)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(row.dayShopActual)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(row.dayOnlineActual)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;"><strong>${formatLkr(row.dayShopActual + row.dayOnlineActual)}</strong></td>
      </tr>`,
        )
        .join("")}
      <tr style="background:#f3f4f6;font-weight:600;">
        <td style="padding:8px;border:1px solid #ddd;">ALL</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(snapshot.channelTotals.dayShopActual)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(snapshot.channelTotals.dayOnlineActual)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(snapshot.channelTotals.dayShopActual + snapshot.channelTotals.dayOnlineActual)}</td>
      </tr>
    </tbody>
  </table>

  <h2 style="font-size:16px;margin:28px 0 8px;">4) Merchant × shop / online (MTD)</h2>
  <p style="margin:0 0 8px;color:#666;font-size:13px;">Monthly shop &amp; online targets vs MTD actuals.</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead>
      <tr style="background:#111;color:#fff;">
        <th style="padding:8px;border:1px solid #333;text-align:left;">Merchant</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">Shop target</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">Shop MTD</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">Online target</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">Online MTD</th>
      </tr>
    </thead>
    <tbody>
      ${snapshot.channelRows
        .map(
          (row) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(row.merchantName)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(row.shopTarget)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(row.shopActual)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(row.onlineTarget)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(row.onlineActual)}</td>
      </tr>`,
        )
        .join("")}
      <tr style="background:#f3f4f6;font-weight:600;">
        <td style="padding:8px;border:1px solid #ddd;">ALL</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(snapshot.channelTotals.shopTarget)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(snapshot.channelTotals.shopActual)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(snapshot.channelTotals.onlineTarget)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatLkr(snapshot.channelTotals.onlineActual)}</td>
      </tr>
    </tbody>
  </table>`
      : "";

  const title =
    snapshot.mode === "daily"
      ? "Call Center Performance — Daily"
      : "Call Center Performance — Weekly";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;max-width:1100px;margin:0 auto;padding:20px;">
  <h1 style="font-size:20px;margin:0 0 8px;">${escapeHtml(title)}</h1>
  <p style="margin:0 0 16px;color:#444;">
    <strong>Company:</strong> ${escapeHtml(snapshot.companyName)}<br/>
    <strong>${escapeHtml(p)}:</strong> ${escapeHtml(snapshot.primaryLabel)}<br/>
    <strong>${escapeHtml(s)}:</strong> ${escapeHtml(snapshot.secondaryLabel)}<br/>
    <strong>Generated:</strong> ${escapeHtml(formatAppDateTime(snapshot.generatedAt))}
  </p>

  <h2 style="font-size:16px;margin:24px 0 8px;">1) Merchant × loyalty</h2>
  <p style="margin:0 0 8px;color:#666;font-size:13px;">Call counts by merchant, split Platinum / Gold / Other. Bulk allocation rows excluded.</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead>
      <tr style="background:#111;color:#fff;">
        <th style="padding:8px;border:1px solid #333;text-align:left;">Merchant</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">${escapeHtml(p)} Pt</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">${escapeHtml(p)} Gold</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">${escapeHtml(p)} Other</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">${escapeHtml(p)} Total</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">${escapeHtml(s)} Pt</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">${escapeHtml(s)} Gold</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">${escapeHtml(s)} Other</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">${escapeHtml(s)} Total</th>
      </tr>
    </thead>
    <tbody>
      ${loyaltyBody}
      ${loyaltyFooter}
    </tbody>
  </table>

  <h2 style="font-size:16px;margin:28px 0 8px;">2) Merchant × outcome</h2>
  <p style="margin:0 0 8px;color:#666;font-size:13px;">Same call events by Call Center outcome category.</p>
  <table style="border-collapse:collapse;width:100%;font-size:12px;overflow-x:auto;">
    <thead>
      <tr style="background:#111;color:#fff;">
        <th style="padding:8px;border:1px solid #333;text-align:left;">Merchant</th>
        ${outcomeHeader}
        <th style="padding:8px;border:1px solid #333;text-align:right;">${escapeHtml(p)} Total</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">${escapeHtml(s)} Total</th>
      </tr>
    </thead>
    <tbody>
      ${outcomeBody}
      ${outcomeFooter}
    </tbody>
  </table>

  ${channelSection}

  <p style="margin-top:24px;color:#888;font-size:12px;">Cosmo OS automated report (${escapeHtml(snapshot.mode)}).</p>
</body>
</html>`.trim();
}

function buildPlain(snapshot: {
  mode: CallCenterReportMode;
  companyName: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryColumn: string;
  secondaryColumn: string;
  loyaltyRows: CallCenterMerchantLoyaltyRow[];
  loyaltyTotals: CallCenterMerchantLoyaltyRow;
  outcomeRows: CallCenterMerchantOutcomeRow[];
  outcomeCategories: string[];
  channelRows: CallCenterChannelTargetRow[];
  channelTotals: CallCenterChannelTargetRow | null;
}): string {
  const lines: string[] = [
    `Call Center Performance (${snapshot.mode}) — ${snapshot.companyName}`,
    `${snapshot.primaryColumn}: ${snapshot.primaryLabel}`,
    `${snapshot.secondaryColumn}: ${snapshot.secondaryLabel}`,
    "",
    `Merchant × loyalty (${snapshot.primaryColumn} Pt/Gold/Other/Total | ${snapshot.secondaryColumn} Pt/Gold/Other/Total)`,
  ];
  for (const row of snapshot.loyaltyRows) {
    lines.push(
      `${row.merchantName}: ${row.primaryPlatinum}/${row.primaryGold}/${row.primaryOther}/${row.primaryTotal} | ${row.secondaryPlatinum}/${row.secondaryGold}/${row.secondaryOther}/${row.secondaryTotal}`,
    );
  }
  const t = snapshot.loyaltyTotals;
  lines.push(
    `ALL: ${t.primaryPlatinum}/${t.primaryGold}/${t.primaryOther}/${t.primaryTotal} | ${t.secondaryPlatinum}/${t.secondaryGold}/${t.secondaryOther}/${t.secondaryTotal}`,
    "",
    `Merchant × outcome (${snapshot.primaryColumn} total / ${snapshot.secondaryColumn} total)`,
  );
  for (const row of snapshot.outcomeRows) {
    lines.push(
      `${row.merchantName}: ${snapshot.primaryColumn} ${row.primaryTotal}, ${snapshot.secondaryColumn} ${row.secondaryTotal}`,
    );
  }
  if (snapshot.mode === "daily" && snapshot.channelTotals) {
    lines.push(
      "",
      "Merchant × day sales (shop / online / total)",
    );
    for (const row of snapshot.channelRows) {
      lines.push(
        `${row.merchantName}: day shop ${formatLkr(row.dayShopActual)} | day online ${formatLkr(row.dayOnlineActual)} | day total ${formatLkr(row.dayShopActual + row.dayOnlineActual)}`,
      );
    }
    lines.push("", "Merchant × shop/online MTD (target / actual)");
    for (const row of snapshot.channelRows) {
      lines.push(
        `${row.merchantName}: shop ${formatLkr(row.shopTarget)}/${formatLkr(row.shopActual)} | online ${formatLkr(row.onlineTarget)}/${formatLkr(row.onlineActual)}`,
      );
    }
  }
  return lines.join("\n");
}

export async function buildCallCenterPerformanceReport(input: {
  companyId: string;
  asOfYmd: string;
  mode: CallCenterReportMode;
}): Promise<CallCenterPerformanceReportSnapshot | null> {
  if (!isValidReportDate(input.asOfYmd)) return null;

  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true },
  });
  if (!company) return null;

  const asOf = input.asOfYmd;
  const primaryFromYmd =
    input.mode === "weekly" ? weekStartMondayYmd(asOf) : asOf;
  const primaryToYmd = asOf;
  const secondaryFromYmd =
    input.mode === "weekly" ? asOf : monthStartYmd(asOf);
  const secondaryToYmd = asOf;

  const primaryColumn = input.mode === "weekly" ? "Week" : "Day";
  const secondaryColumn = input.mode === "weekly" ? "Day" : "MTD";
  const primaryLabel = formatDisplayRange(primaryFromYmd, primaryToYmd);
  const secondaryLabel =
    input.mode === "weekly"
      ? formatDisplayDay(asOf)
      : formatDisplayRange(secondaryFromYmd, secondaryToYmd);

  const [primaryTier, secondaryTier, primaryCat, secondaryCat, channel] =
    await Promise.all([
      fetchTierRows({
        companyId: company.id,
        fromYmd: primaryFromYmd,
        toYmd: primaryToYmd,
      }),
      fetchTierRows({
        companyId: company.id,
        fromYmd: secondaryFromYmd,
        toYmd: secondaryToYmd,
      }),
      fetchCategoryRows({
        companyId: company.id,
        fromYmd: primaryFromYmd,
        toYmd: primaryToYmd,
      }),
      fetchCategoryRows({
        companyId: company.id,
        fromYmd: secondaryFromYmd,
        toYmd: secondaryToYmd,
      }),
      input.mode === "daily"
        ? fetchChannelTargetRows({ companyId: company.id, asOfYmd: asOf })
        : Promise.resolve({ rows: [], totals: null }),
    ]);

  const labels = await resolveMerchantLabels([
    ...primaryTier,
    ...secondaryTier,
    ...primaryCat,
    ...secondaryCat,
  ]);

  const loyaltyMap = new Map<string, CallCenterMerchantLoyaltyRow>();
  const ensureLoyalty = (merchantId: string | null, orphanName: string) => {
    const key = merchantKey(merchantId, orphanName);
    let row = loyaltyMap.get(key);
    if (!row) {
      row = emptyLoyaltyRow(
        merchantId,
        labels.get(key) ?? (orphanName || "Unknown"),
      );
      loyaltyMap.set(key, row);
    }
    return row;
  };

  for (const row of primaryTier) {
    applyTierCounts(
      ensureLoyalty(row.merchantId, row.orphanName),
      "primary",
      row.tier,
      row.count,
    );
  }
  for (const row of secondaryTier) {
    applyTierCounts(
      ensureLoyalty(row.merchantId, row.orphanName),
      "secondary",
      row.tier,
      row.count,
    );
  }

  const loyaltyRows = [...loyaltyMap.values()].sort(
    (a, b) =>
      b.primaryTotal - a.primaryTotal || b.secondaryTotal - a.secondaryTotal,
  );
  const loyaltyTotals = emptyLoyaltyRow(null, "ALL");
  for (const row of loyaltyRows) {
    loyaltyTotals.primaryPlatinum += row.primaryPlatinum;
    loyaltyTotals.primaryGold += row.primaryGold;
    loyaltyTotals.primaryOther += row.primaryOther;
    loyaltyTotals.primaryTotal += row.primaryTotal;
    loyaltyTotals.secondaryPlatinum += row.secondaryPlatinum;
    loyaltyTotals.secondaryGold += row.secondaryGold;
    loyaltyTotals.secondaryOther += row.secondaryOther;
    loyaltyTotals.secondaryTotal += row.secondaryTotal;
  }

  const outcomeMap = new Map<string, CallCenterMerchantOutcomeRow>();
  const categorySet = new Set<string>();
  const ensureOutcome = (merchantId: string | null, orphanName: string) => {
    const key = merchantKey(merchantId, orphanName);
    let row = outcomeMap.get(key);
    if (!row) {
      row = emptyOutcomeRow(
        merchantId,
        labels.get(key) ?? (orphanName || "Unknown"),
      );
      outcomeMap.set(key, row);
    }
    return row;
  };

  for (const row of primaryCat) {
    categorySet.add(row.category);
    const entry = ensureOutcome(row.merchantId, row.orphanName);
    entry.primaryByCategory[row.category] =
      (entry.primaryByCategory[row.category] ?? 0) + row.count;
    entry.primaryTotal += row.count;
  }
  for (const row of secondaryCat) {
    categorySet.add(row.category);
    const entry = ensureOutcome(row.merchantId, row.orphanName);
    entry.secondaryByCategory[row.category] =
      (entry.secondaryByCategory[row.category] ?? 0) + row.count;
    entry.secondaryTotal += row.count;
  }

  const preferred = new Set<string>([
    ...CALL_CENTER_CATEGORY_VALUES,
    CALL_CENTER_CONTACTED_CATEGORY,
  ]);
  const outcomeCategories = sortCallCenterCategories([
    ...[...preferred].filter((c) => categorySet.has(c)),
    ...[...categorySet].filter((c) => !preferred.has(c)),
  ]);

  const outcomeRows = [...outcomeMap.values()].sort(
    (a, b) =>
      b.primaryTotal - a.primaryTotal || b.secondaryTotal - a.secondaryTotal,
  );
  const outcomeTotals = emptyOutcomeRow(null, "ALL");
  for (const row of outcomeRows) {
    outcomeTotals.primaryTotal += row.primaryTotal;
    outcomeTotals.secondaryTotal += row.secondaryTotal;
    for (const cat of outcomeCategories) {
      outcomeTotals.primaryByCategory[cat] =
        (outcomeTotals.primaryByCategory[cat] ?? 0) +
        (row.primaryByCategory[cat] ?? 0);
      outcomeTotals.secondaryByCategory[cat] =
        (outcomeTotals.secondaryByCategory[cat] ?? 0) +
        (row.secondaryByCategory[cat] ?? 0);
    }
  }

  const generatedAt = new Date().toISOString();
  const subject =
    input.mode === "daily"
      ? `Call Center Performance — Day ${primaryLabel} + MTD`
      : `Call Center Performance — Week ${primaryLabel} + Day ${secondaryLabel}`;

  const htmlBody = buildHtml({
    mode: input.mode,
    companyName: company.name,
    primaryLabel,
    secondaryLabel,
    primaryColumn,
    secondaryColumn,
    generatedAt,
    loyaltyRows,
    loyaltyTotals,
    outcomeRows,
    outcomeCategories,
    outcomeTotals,
    channelRows: channel.rows,
    channelTotals: channel.totals,
  });
  const plainBody = buildPlain({
    mode: input.mode,
    companyName: company.name,
    primaryLabel,
    secondaryLabel,
    primaryColumn,
    secondaryColumn,
    loyaltyRows,
    loyaltyTotals,
    outcomeRows,
    outcomeCategories,
    channelRows: channel.rows,
    channelTotals: channel.totals,
  });

  return {
    mode: input.mode,
    companyId: company.id,
    companyName: company.name,
    asOfYmd: asOf,
    primaryFromYmd,
    primaryToYmd,
    secondaryFromYmd,
    secondaryToYmd,
    primaryLabel,
    secondaryLabel,
    primaryColumn,
    secondaryColumn,
    generatedAt,
    loyaltyRows,
    loyaltyTotals,
    outcomeRows,
    outcomeCategories,
    outcomeTotals,
    channelRows: channel.rows,
    channelTotals: channel.totals,
    subject,
    htmlBody,
    plainBody,
  };
}

/** @deprecated Prefer buildCallCenterPerformanceReport({ mode: "weekly" }) */
export async function buildCallCenterWeeklyReport(input: {
  companyId: string;
  asOfYmd: string;
}) {
  return buildCallCenterPerformanceReport({ ...input, mode: "weekly" });
}

export async function runCallCenterPerformanceEmail(input: {
  mode: CallCenterReportMode;
  companyId?: string;
  asOfYmd?: string;
  recipients?: string[];
  source?: CallCenterPerformanceEmailSource;
}): Promise<{
  status: CallCenterPerformanceEmailSendStatus;
  mode: CallCenterReportMode;
  asOfYmd: string;
  message?: string;
  companyId?: string;
}> {
  const asOfYmd =
    input.asOfYmd && isValidReportDate(input.asOfYmd)
      ? input.asOfYmd
      : getPreviousColomboReportDate();

  const recipients = (input.recipients?.length
    ? input.recipients
    : CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS
  )
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));

  if (recipients.length === 0) {
    return { status: "skipped_no_recipients", mode: input.mode, asOfYmd };
  }

  const company = input.companyId
    ? await prisma.company.findUnique({
        where: { id: input.companyId },
        select: { id: true },
      })
    : await prisma.company.findFirst({ select: { id: true } });

  if (!company) {
    return { status: "skipped_no_company", mode: input.mode, asOfYmd };
  }

  const snapshot = await buildCallCenterPerformanceReport({
    companyId: company.id,
    asOfYmd,
    mode: input.mode,
  });
  if (!snapshot) {
    return {
      status: "failed",
      mode: input.mode,
      asOfYmd,
      companyId: company.id,
      message: "Failed to build report",
    };
  }

  const sent = await sendCallCenterWeeklyReportEmail({
    toEmails: recipients,
    subject: snapshot.subject,
    html: snapshot.htmlBody,
    plain: snapshot.plainBody,
  });

  if (!sent.success) {
    return {
      status: "failed",
      mode: input.mode,
      asOfYmd,
      companyId: company.id,
      message: sent.message ?? "Maileroo send failed",
    };
  }

  return {
    status: "sent",
    mode: input.mode,
    asOfYmd,
    companyId: company.id,
    message: `Sent ${input.mode} to ${recipients.join(", ")} (${input.source ?? "manual"})`,
  };
}

/** @deprecated Prefer runCallCenterPerformanceEmail({ mode: "weekly" }) */
export async function runCallCenterWeeklyEmail(input: {
  companyId?: string;
  asOfYmd?: string;
  recipients?: string[];
  source?: CallCenterPerformanceEmailSource;
}) {
  const result = await runCallCenterPerformanceEmail({
    ...input,
    mode: "weekly",
  });
  return {
    status: result.status,
    asOfYmd: result.asOfYmd,
    message: result.message,
    companyId: result.companyId,
  };
}
