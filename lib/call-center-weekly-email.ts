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
import {
  labelCallCenterPerformanceMerchant,
  parseCallCenterDayEnd,
  parseCallCenterDayStart,
} from "@/lib/page-data/call-center-performance";
import { prisma } from "@/lib/prisma";

const REPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Default recipient for Cosmetics.lk call-center Monday report. */
export const CALL_CENTER_WEEKLY_EMAIL_RECIPIENTS = ["asitha@cosmetics.lk"];

export type CallCenterWeeklyEmailSource = "cron" | "manual";

export type CallCenterWeeklyEmailSendStatus =
  | "sent"
  | "failed"
  | "skipped_no_recipients"
  | "skipped_no_company";

export type CallCenterMerchantLoyaltyRow = {
  merchantId: string | null;
  merchantName: string;
  weekPlatinum: number;
  weekGold: number;
  weekOther: number;
  weekTotal: number;
  mtdPlatinum: number;
  mtdGold: number;
  mtdOther: number;
  mtdTotal: number;
};

export type CallCenterMerchantOutcomeRow = {
  merchantId: string | null;
  merchantName: string;
  weekByCategory: Record<string, number>;
  mtdByCategory: Record<string, number>;
  weekTotal: number;
  mtdTotal: number;
};

export type CallCenterWeeklyReportSnapshot = {
  companyId: string;
  companyName: string;
  asOfYmd: string;
  weekFromYmd: string;
  weekToYmd: string;
  mtdFromYmd: string;
  mtdToYmd: string;
  generatedAt: string;
  loyaltyRows: CallCenterMerchantLoyaltyRow[];
  loyaltyTotals: CallCenterMerchantLoyaltyRow;
  outcomeRows: CallCenterMerchantOutcomeRow[];
  outcomeCategories: string[];
  outcomeTotals: CallCenterMerchantOutcomeRow;
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
  // Noon avoids midnight edge cases when shifting calendar days.
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
    weekPlatinum: 0,
    weekGold: 0,
    weekOther: 0,
    weekTotal: 0,
    mtdPlatinum: 0,
    mtdGold: 0,
    mtdOther: 0,
    mtdTotal: 0,
  };
}

function emptyOutcomeRow(
  merchantId: string | null,
  merchantName: string,
): CallCenterMerchantOutcomeRow {
  return {
    merchantId,
    merchantName,
    weekByCategory: {},
    mtdByCategory: {},
    weekTotal: 0,
    mtdTotal: 0,
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
  period: "week" | "mtd",
  tier: TierBucket,
  count: number,
) {
  if (period === "week") {
    if (tier === "platinum") target.weekPlatinum += count;
    else if (tier === "gold") target.weekGold += count;
    else target.weekOther += count;
    target.weekTotal += count;
  } else {
    if (tier === "platinum") target.mtdPlatinum += count;
    else if (tier === "gold") target.mtdGold += count;
    else target.mtdOther += count;
    target.mtdTotal += count;
  }
}

function formatDisplayRange(fromYmd: string, toYmd: string): string {
  const from = formatAppDateShort(`${fromYmd}T12:00:00+05:30`);
  const to = formatAppDateShort(`${toYmd}T12:00:00+05:30`);
  return `${from} – ${to}`;
}

function buildHtml(snapshot: {
  companyName: string;
  weekLabel: string;
  mtdLabel: string;
  generatedAt: string;
  loyaltyRows: CallCenterMerchantLoyaltyRow[];
  loyaltyTotals: CallCenterMerchantLoyaltyRow;
  outcomeRows: CallCenterMerchantOutcomeRow[];
  outcomeCategories: string[];
  outcomeTotals: CallCenterMerchantOutcomeRow;
}): string {
  const loyaltyBody = snapshot.loyaltyRows
    .map(
      (row) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(row.merchantName)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.weekPlatinum}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.weekGold}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.weekOther}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;"><strong>${row.weekTotal}</strong></td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.mtdPlatinum}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.mtdGold}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${row.mtdOther}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;"><strong>${row.mtdTotal}</strong></td>
      </tr>`,
    )
    .join("");

  const loyaltyTotal = snapshot.loyaltyTotals;
  const loyaltyFooter = `
      <tr style="background:#f3f4f6;font-weight:600;">
        <td style="padding:8px;border:1px solid #ddd;">ALL</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${loyaltyTotal.weekPlatinum}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${loyaltyTotal.weekGold}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${loyaltyTotal.weekOther}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${loyaltyTotal.weekTotal}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${loyaltyTotal.mtdPlatinum}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${loyaltyTotal.mtdGold}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${loyaltyTotal.mtdOther}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${loyaltyTotal.mtdTotal}</td>
      </tr>`;

  const outcomeHeader = snapshot.outcomeCategories
    .map(
      (cat) =>
        `<th style="padding:8px;border:1px solid #ddd;text-align:right;">W ${escapeHtml(cat)}</th>
         <th style="padding:8px;border:1px solid #ddd;text-align:right;">MTD ${escapeHtml(cat)}</th>`,
    )
    .join("");

  const outcomeBody = snapshot.outcomeRows
    .map((row) => {
      const cells = snapshot.outcomeCategories
        .map((cat) => {
          const week = row.weekByCategory[cat] ?? 0;
          const mtd = row.mtdByCategory[cat] ?? 0;
          return `<td style="padding:8px;border:1px solid #ddd;text-align:right;">${week}</td>
                  <td style="padding:8px;border:1px solid #ddd;text-align:right;">${mtd}</td>`;
        })
        .join("");
      return `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(row.merchantName)}</td>
        ${cells}
        <td style="padding:8px;border:1px solid #ddd;text-align:right;"><strong>${row.weekTotal}</strong></td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;"><strong>${row.mtdTotal}</strong></td>
      </tr>`;
    })
    .join("");

  const outcomeTotalCells = snapshot.outcomeCategories
    .map((cat) => {
      const week = snapshot.outcomeTotals.weekByCategory[cat] ?? 0;
      const mtd = snapshot.outcomeTotals.mtdByCategory[cat] ?? 0;
      return `<td style="padding:8px;border:1px solid #ddd;text-align:right;">${week}</td>
              <td style="padding:8px;border:1px solid #ddd;text-align:right;">${mtd}</td>`;
    })
    .join("");

  const outcomeFooter = `
      <tr style="background:#f3f4f6;font-weight:600;">
        <td style="padding:8px;border:1px solid #ddd;">ALL</td>
        ${outcomeTotalCells}
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${snapshot.outcomeTotals.weekTotal}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${snapshot.outcomeTotals.mtdTotal}</td>
      </tr>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;max-width:1100px;margin:0 auto;padding:20px;">
  <h1 style="font-size:20px;margin:0 0 8px;">Call Center Performance</h1>
  <p style="margin:0 0 16px;color:#444;">
    <strong>Company:</strong> ${escapeHtml(snapshot.companyName)}<br/>
    <strong>Week:</strong> ${escapeHtml(snapshot.weekLabel)}<br/>
    <strong>MTD:</strong> ${escapeHtml(snapshot.mtdLabel)}<br/>
    <strong>Generated:</strong> ${escapeHtml(formatAppDateTime(snapshot.generatedAt))}
  </p>

  <h2 style="font-size:16px;margin:24px 0 8px;">1) Merchant × loyalty</h2>
  <p style="margin:0 0 8px;color:#666;font-size:13px;">Call counts by merchant, split Platinum / Gold / Other (contact loyalty tier). Bulk allocation rows excluded.</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead>
      <tr style="background:#111;color:#fff;">
        <th style="padding:8px;border:1px solid #333;text-align:left;">Merchant</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">Week Pt</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">Week Gold</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">Week Other</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">Week Total</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">MTD Pt</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">MTD Gold</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">MTD Other</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">MTD Total</th>
      </tr>
    </thead>
    <tbody>
      ${loyaltyBody}
      ${loyaltyFooter}
    </tbody>
  </table>

  <h2 style="font-size:16px;margin:28px 0 8px;">2) Merchant × outcome</h2>
  <p style="margin:0 0 8px;color:#666;font-size:13px;">Same call events by Call Center outcome category (Week + MTD).</p>
  <table style="border-collapse:collapse;width:100%;font-size:12px;overflow-x:auto;">
    <thead>
      <tr style="background:#111;color:#fff;">
        <th style="padding:8px;border:1px solid #333;text-align:left;">Merchant</th>
        ${outcomeHeader}
        <th style="padding:8px;border:1px solid #333;text-align:right;">Week Total</th>
        <th style="padding:8px;border:1px solid #333;text-align:right;">MTD Total</th>
      </tr>
    </thead>
    <tbody>
      ${outcomeBody}
      ${outcomeFooter}
    </tbody>
  </table>

  <p style="margin-top:24px;color:#888;font-size:12px;">Cosmo OS automated report. Sent every Monday morning (Asia/Colombo).</p>
</body>
</html>`.trim();
}

function buildPlain(snapshot: {
  companyName: string;
  weekLabel: string;
  mtdLabel: string;
  loyaltyRows: CallCenterMerchantLoyaltyRow[];
  loyaltyTotals: CallCenterMerchantLoyaltyRow;
  outcomeRows: CallCenterMerchantOutcomeRow[];
  outcomeCategories: string[];
}): string {
  const lines: string[] = [
    `Call Center Performance — ${snapshot.companyName}`,
    `Week: ${snapshot.weekLabel}`,
    `MTD: ${snapshot.mtdLabel}`,
    "",
    "Merchant × loyalty (Week Pt/Gold/Other/Total | MTD Pt/Gold/Other/Total)",
  ];
  for (const row of snapshot.loyaltyRows) {
    lines.push(
      `${row.merchantName}: ${row.weekPlatinum}/${row.weekGold}/${row.weekOther}/${row.weekTotal} | ${row.mtdPlatinum}/${row.mtdGold}/${row.mtdOther}/${row.mtdTotal}`,
    );
  }
  const t = snapshot.loyaltyTotals;
  lines.push(
    `ALL: ${t.weekPlatinum}/${t.weekGold}/${t.weekOther}/${t.weekTotal} | ${t.mtdPlatinum}/${t.mtdGold}/${t.mtdOther}/${t.mtdTotal}`,
    "",
    "Merchant × outcome (week total / mtd total)",
  );
  for (const row of snapshot.outcomeRows) {
    const catBits = snapshot.outcomeCategories
      .map((cat) => `${cat}=${row.weekByCategory[cat] ?? 0}/${row.mtdByCategory[cat] ?? 0}`)
      .join(", ");
    lines.push(
      `${row.merchantName}: week ${row.weekTotal}, mtd ${row.mtdTotal} (${catBits})`,
    );
  }
  return lines.join("\n");
}

export async function buildCallCenterWeeklyReport(input: {
  companyId: string;
  asOfYmd: string;
}): Promise<CallCenterWeeklyReportSnapshot | null> {
  if (!isValidReportDate(input.asOfYmd)) return null;

  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true },
  });
  if (!company) return null;

  const weekFromYmd = weekStartMondayYmd(input.asOfYmd);
  const weekToYmd = input.asOfYmd;
  const mtdFromYmd = monthStartYmd(input.asOfYmd);
  const mtdToYmd = input.asOfYmd;

  const [weekTier, mtdTier, weekCat, mtdCat] = await Promise.all([
    fetchTierRows({
      companyId: company.id,
      fromYmd: weekFromYmd,
      toYmd: weekToYmd,
    }),
    fetchTierRows({
      companyId: company.id,
      fromYmd: mtdFromYmd,
      toYmd: mtdToYmd,
    }),
    fetchCategoryRows({
      companyId: company.id,
      fromYmd: weekFromYmd,
      toYmd: weekToYmd,
    }),
    fetchCategoryRows({
      companyId: company.id,
      fromYmd: mtdFromYmd,
      toYmd: mtdToYmd,
    }),
  ]);

  const labels = await resolveMerchantLabels([
    ...weekTier,
    ...mtdTier,
    ...weekCat,
    ...mtdCat,
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

  for (const row of weekTier) {
    applyTierCounts(
      ensureLoyalty(row.merchantId, row.orphanName),
      "week",
      row.tier,
      row.count,
    );
  }
  for (const row of mtdTier) {
    applyTierCounts(
      ensureLoyalty(row.merchantId, row.orphanName),
      "mtd",
      row.tier,
      row.count,
    );
  }

  const loyaltyRows = [...loyaltyMap.values()].sort(
    (a, b) => b.weekTotal - a.weekTotal || b.mtdTotal - a.mtdTotal,
  );
  const loyaltyTotals = emptyLoyaltyRow(null, "ALL");
  for (const row of loyaltyRows) {
    loyaltyTotals.weekPlatinum += row.weekPlatinum;
    loyaltyTotals.weekGold += row.weekGold;
    loyaltyTotals.weekOther += row.weekOther;
    loyaltyTotals.weekTotal += row.weekTotal;
    loyaltyTotals.mtdPlatinum += row.mtdPlatinum;
    loyaltyTotals.mtdGold += row.mtdGold;
    loyaltyTotals.mtdOther += row.mtdOther;
    loyaltyTotals.mtdTotal += row.mtdTotal;
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

  for (const row of weekCat) {
    categorySet.add(row.category);
    const entry = ensureOutcome(row.merchantId, row.orphanName);
    entry.weekByCategory[row.category] =
      (entry.weekByCategory[row.category] ?? 0) + row.count;
    entry.weekTotal += row.count;
  }
  for (const row of mtdCat) {
    categorySet.add(row.category);
    const entry = ensureOutcome(row.merchantId, row.orphanName);
    entry.mtdByCategory[row.category] =
      (entry.mtdByCategory[row.category] ?? 0) + row.count;
    entry.mtdTotal += row.count;
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
    (a, b) => b.weekTotal - a.weekTotal || b.mtdTotal - a.mtdTotal,
  );
  const outcomeTotals = emptyOutcomeRow(null, "ALL");
  for (const row of outcomeRows) {
    outcomeTotals.weekTotal += row.weekTotal;
    outcomeTotals.mtdTotal += row.mtdTotal;
    for (const cat of outcomeCategories) {
      outcomeTotals.weekByCategory[cat] =
        (outcomeTotals.weekByCategory[cat] ?? 0) +
        (row.weekByCategory[cat] ?? 0);
      outcomeTotals.mtdByCategory[cat] =
        (outcomeTotals.mtdByCategory[cat] ?? 0) + (row.mtdByCategory[cat] ?? 0);
    }
  }

  const weekLabel = formatDisplayRange(weekFromYmd, weekToYmd);
  const mtdLabel = formatDisplayRange(mtdFromYmd, mtdToYmd);
  const generatedAt = new Date().toISOString();
  const subject = `Call Center Performance — Week ${weekLabel} + MTD`;

  const htmlBody = buildHtml({
    companyName: company.name,
    weekLabel,
    mtdLabel,
    generatedAt,
    loyaltyRows,
    loyaltyTotals,
    outcomeRows,
    outcomeCategories,
    outcomeTotals,
  });
  const plainBody = buildPlain({
    companyName: company.name,
    weekLabel,
    mtdLabel,
    loyaltyRows,
    loyaltyTotals,
    outcomeRows,
    outcomeCategories,
  });

  return {
    companyId: company.id,
    companyName: company.name,
    asOfYmd: input.asOfYmd,
    weekFromYmd,
    weekToYmd,
    mtdFromYmd,
    mtdToYmd,
    generatedAt,
    loyaltyRows,
    loyaltyTotals,
    outcomeRows,
    outcomeCategories,
    outcomeTotals,
    subject,
    htmlBody,
    plainBody,
  };
}

export async function runCallCenterWeeklyEmail(input: {
  companyId?: string;
  asOfYmd?: string;
  recipients?: string[];
  source?: CallCenterWeeklyEmailSource;
}): Promise<{
  status: CallCenterWeeklyEmailSendStatus;
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
    : CALL_CENTER_WEEKLY_EMAIL_RECIPIENTS
  )
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));

  if (recipients.length === 0) {
    return { status: "skipped_no_recipients", asOfYmd };
  }

  const company =
    input.companyId
      ? await prisma.company.findUnique({
          where: { id: input.companyId },
          select: { id: true },
        })
      : await prisma.company.findFirst({ select: { id: true } });

  if (!company) {
    return { status: "skipped_no_company", asOfYmd };
  }

  const snapshot = await buildCallCenterWeeklyReport({
    companyId: company.id,
    asOfYmd,
  });
  if (!snapshot) {
    return {
      status: "failed",
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
      asOfYmd,
      companyId: company.id,
      message: sent.message ?? "Maileroo send failed",
    };
  }

  return {
    status: "sent",
    asOfYmd,
    companyId: company.id,
    message: `Sent to ${recipients.join(", ")} (${input.source ?? "manual"})`,
  };
}
