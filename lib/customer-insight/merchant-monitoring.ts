import {
  contactOrderLookupKeys,
  type ContactOrderLookup,
} from "@/lib/contact-purchase-lookup";
import {
  listInsightMerchantRosterOptions,
  resolveAssignedMerchantFilterLabels,
} from "@/lib/customer-insight/merchant-label-aliases";
import { effectiveLoyaltyTierKey } from "@/lib/customer-insight/erp-loyalty";
import {
  attributeOrderTotalsByContact,
  customerLifetimeTotalOrderWhere,
} from "@/lib/customer-insight/lifetime-total";
import {
  classifyPurchaseRecencyBucket,
  PURCHASE_RECENCY_BUCKET_LABELS,
  PURCHASE_RECENCY_BUCKET_ORDER,
  type PurchaseRecencyBucketKey,
} from "@/lib/customer-insight/merchant-monitoring-recency";
import {
  defaultMtdPeriod,
  resolveMerchantMonitoringPeriod,
  type MerchantMonitoringPeriod,
  type MerchantMonitoringPeriodPreset,
} from "@/lib/customer-insight/merchant-monitoring-period";
import type { LoyaltyTierKey } from "@/lib/customer-insight/types";
import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";

export type TierCountTriple = {
  gold: number;
  platinum: number;
  standard: number;
  total: number;
};

export type MerchantMonitoringPortfolioRow = {
  merchantValue: string;
  merchantLabel: string;
  allocatedTotal: number;
  tiers: TierCountTriple;
  dobCompleteCount: number;
  dobCompletePercent: number;
  emailCompleteCount: number;
  emailCompletePercent: number;
  purchasedInPeriodCount: number;
};

export type RecencyBucketCell = {
  bucket: PurchaseRecencyBucketKey;
  label: string;
  tiers: TierCountTriple;
};

export type MerchantMonitoringRecencyRow = {
  merchantValue: string;
  merchantLabel: string;
  buckets: RecencyBucketCell[];
};

export type MerchantMonitoringReport = {
  period: MerchantMonitoringPeriod;
  generatedAt: string;
  unallocatedCount: number;
  portfolioRows: MerchantMonitoringPortfolioRow[];
  companyPortfolio: MerchantMonitoringPortfolioRow;
  recencyRows: MerchantMonitoringRecencyRow[];
  companyRecency: RecencyBucketCell[];
};

export type BuildMerchantMonitoringReportInput = {
  fromYmd: string;
  toYmd: string;
  preset?: MerchantMonitoringPeriodPreset;
  assignedMerchant?: string;
  todayYmd?: string;
};

const CONTACT_BATCH = 2_000;
const ADAPT_ID_CHUNK = 4_000;
const ORDER_LOOKUP_IN_CAP = 800;

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function emptyTiers(): TierCountTriple {
  return { gold: 0, platinum: 0, standard: 0, total: 0 };
}

function bumpTier(tiers: TierCountTriple, key: LoyaltyTierKey) {
  if (key === "gold") tiers.gold += 1;
  else if (key === "platinum") tiers.platinum += 1;
  else tiers.standard += 1;
  tiers.total += 1;
}

function percent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function hasDob(month: number | null, day: number | null): boolean {
  return (
    month != null &&
    month >= 1 &&
    month <= 12 &&
    day != null &&
    day >= 1 &&
    day <= 31
  );
}

function hasEmail(email: string | null | undefined): boolean {
  return Boolean(email?.trim());
}

type MerchantAccumulator = {
  merchantValue: string;
  merchantLabel: string;
  allocatedTotal: number;
  tiers: TierCountTriple;
  dobCompleteCount: number;
  emailCompleteCount: number;
  purchasedInPeriodCount: number;
  recency: Map<PurchaseRecencyBucketKey, TierCountTriple>;
};

function createAccumulator(
  merchantValue: string,
  merchantLabel: string
): MerchantAccumulator {
  const recency = new Map<PurchaseRecencyBucketKey, TierCountTriple>();
  for (const bucket of PURCHASE_RECENCY_BUCKET_ORDER) {
    recency.set(bucket, emptyTiers());
  }
  return {
    merchantValue,
    merchantLabel,
    allocatedTotal: 0,
    tiers: emptyTiers(),
    dobCompleteCount: 0,
    emailCompleteCount: 0,
    purchasedInPeriodCount: 0,
    recency,
  };
}

function toPortfolioRow(acc: MerchantAccumulator): MerchantMonitoringPortfolioRow {
  return {
    merchantValue: acc.merchantValue,
    merchantLabel: acc.merchantLabel,
    allocatedTotal: acc.allocatedTotal,
    tiers: { ...acc.tiers },
    dobCompleteCount: acc.dobCompleteCount,
    dobCompletePercent: percent(acc.dobCompleteCount, acc.allocatedTotal),
    emailCompleteCount: acc.emailCompleteCount,
    emailCompletePercent: percent(acc.emailCompleteCount, acc.allocatedTotal),
    purchasedInPeriodCount: acc.purchasedInPeriodCount,
  };
}

function toRecencyRow(acc: MerchantAccumulator): MerchantMonitoringRecencyRow {
  return {
    merchantValue: acc.merchantValue,
    merchantLabel: acc.merchantLabel,
    buckets: PURCHASE_RECENCY_BUCKET_ORDER.map((bucket) => ({
      bucket,
      label: PURCHASE_RECENCY_BUCKET_LABELS[bucket],
      tiers: { ...(acc.recency.get(bucket) ?? emptyTiers()) },
    })),
  };
}

function sumRecencyCells(rows: MerchantAccumulator[]): RecencyBucketCell[] {
  return PURCHASE_RECENCY_BUCKET_ORDER.map((bucket) => {
    const tiers = emptyTiers();
    for (const row of rows) {
      const cell = row.recency.get(bucket) ?? emptyTiers();
      tiers.gold += cell.gold;
      tiers.platinum += cell.platinum;
      tiers.standard += cell.standard;
      tiers.total += cell.total;
    }
    return {
      bucket,
      label: PURCHASE_RECENCY_BUCKET_LABELS[bucket],
      tiers,
    };
  });
}

function sumPortfolioRows(
  rows: MerchantMonitoringPortfolioRow[],
  label: string
): MerchantMonitoringPortfolioRow {
  const tiers = emptyTiers();
  let allocatedTotal = 0;
  let dobCompleteCount = 0;
  let emailCompleteCount = 0;
  let purchasedInPeriodCount = 0;
  for (const row of rows) {
    allocatedTotal += row.allocatedTotal;
    tiers.gold += row.tiers.gold;
    tiers.platinum += row.tiers.platinum;
    tiers.standard += row.tiers.standard;
    tiers.total += row.tiers.total;
    dobCompleteCount += row.dobCompleteCount;
    emailCompleteCount += row.emailCompleteCount;
    purchasedInPeriodCount += row.purchasedInPeriodCount;
  }
  return {
    merchantValue: "__company__",
    merchantLabel: label,
    allocatedTotal,
    tiers,
    dobCompleteCount,
    dobCompletePercent: percent(dobCompleteCount, allocatedTotal),
    emailCompleteCount,
    emailCompletePercent: percent(emailCompleteCount, allocatedTotal),
    purchasedInPeriodCount,
  };
}

async function buildAliasToRoster(companyId: string) {
  const roster = await listInsightMerchantRosterOptions(companyId);
  const aliasToRoster = new Map<
    string,
    { value: string; label: string }
  >();
  await Promise.all(
    roster.map(async (opt) => {
      const aliases = await resolveAssignedMerchantFilterLabels(
        companyId,
        opt.value
      );
      for (const alias of aliases) {
        const key = norm(alias);
        if (!key || aliasToRoster.has(key)) continue;
        aliasToRoster.set(key, { value: opt.value, label: opt.label });
      }
      const valueKey = norm(opt.value);
      if (valueKey && !aliasToRoster.has(valueKey)) {
        aliasToRoster.set(valueKey, { value: opt.value, label: opt.label });
      }
    })
  );
  return aliasToRoster;
}

async function loadAllocatedContacts(companyId: string) {
  const out: Array<{
    id: string;
    assignedMerchant: string | null;
    loyaltyAssignedTier: string | null;
    email: string | null;
    birthMonth: number | null;
    birthDay: number | null;
    lastPurchaseAt: Date | null;
    phoneNumber: string | null;
    phones: Array<{ phoneNumber: string }>;
    emails: Array<{ email: string }>;
  }> = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.contactMaster.findMany({
      where: {
        companyId,
        assignedMerchant: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: CONTACT_BATCH,
      select: {
        id: true,
        assignedMerchant: true,
        loyaltyAssignedTier: true,
        email: true,
        birthMonth: true,
        birthDay: true,
        lastPurchaseAt: true,
        phoneNumber: true,
        phones: { select: { phoneNumber: true } },
        emails: { select: { email: true } },
      },
    });
    if (batch.length === 0) break;
    out.push(...batch);
    cursor = batch[batch.length - 1]?.id;
    if (batch.length < CONTACT_BATCH) break;
  }
  return out;
}

async function purchasedInPeriodContactIds(
  companyId: string,
  contactIds: string[],
  fromYmd: string,
  toYmd: string,
  contacts: Array<{
    id: string;
    email: string | null;
    phoneNumber: string | null;
    phones: Array<{ phoneNumber: string }>;
    emails: Array<{ email: string }>;
  }>
): Promise<Set<string>> {
  const purchased = new Set<string>();
  if (contactIds.length === 0) return purchased;

  const start = parseAppCalendarDayStart(fromYmd);
  const end = parseAppCalendarDayEnd(toYmd);
  if (!start || !end) return purchased;

  for (let i = 0; i < contactIds.length; i += ADAPT_ID_CHUNK) {
    const slice = contactIds.slice(i, i + ADAPT_ID_CHUNK);
    const rows = await prisma.adaptPurchaseHistory.findMany({
      where: {
        companyId,
        contactId: { in: slice },
        invoiceDate: { gte: start, lte: end },
      },
      select: { contactId: true },
      distinct: ["contactId"],
    });
    for (const row of rows) purchased.add(row.contactId);
  }

  const lookupByContactId = new Map<string, ContactOrderLookup>();
  const allPhones: string[] = [];
  const allEmails: string[] = [];
  const seenPhone = new Set<string>();
  const seenEmail = new Set<string>();

  for (const contact of contacts) {
    const keys = contactOrderLookupKeys({
      primaryEmail: contact.email,
      primaryPhone: contact.phoneNumber,
      aliasEmails: contact.emails.map((row) => row.email),
      aliasPhones: contact.phones.map((row) => row.phoneNumber),
    });
    lookupByContactId.set(contact.id, keys);
    for (const phone of keys.phones) {
      if (seenPhone.has(phone)) continue;
      seenPhone.add(phone);
      allPhones.push(phone);
    }
    for (const email of keys.emails) {
      const key = email.trim().toLowerCase();
      if (!key || seenEmail.has(key)) continue;
      seenEmail.add(key);
      allEmails.push(email);
    }
  }

  const hasOrderKeys = allPhones.length > 0 || allEmails.length > 0;
  const useInFilter =
    hasOrderKeys && allPhones.length + allEmails.length <= ORDER_LOOKUP_IN_CAP;

  if (!hasOrderKeys) return purchased;

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      ...customerLifetimeTotalOrderWhere(),
      createdAt: { gte: start, lte: end },
      ...(useInFilter
        ? {
            OR: [
              ...(allPhones.length > 0
                ? [
                    { customerPhone: { in: allPhones } },
                    { erpnextCustomerId: { in: allPhones } },
                  ]
                : []),
              ...(allEmails.length > 0
                ? [
                    {
                      customerEmail: {
                        in: allEmails,
                        mode: "insensitive" as const,
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    },
    select: {
      customerPhone: true,
      customerEmail: true,
      erpnextCustomerId: true,
      totalPrice: true,
    },
  });

  const attributed = attributeOrderTotalsByContact({
    lookupByContactId,
    orders: orders.map((order) => ({
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      erpnextCustomerId: order.erpnextCustomerId,
      totalPrice: order.totalPrice.toString(),
    })),
  });

  for (const [contactId, total] of attributed) {
    if (total > 0) purchased.add(contactId);
  }

  return purchased;
}

export async function buildMerchantMonitoringReport(
  companyId: string,
  input: BuildMerchantMonitoringReportInput
): Promise<MerchantMonitoringReport> {
  const todayYmd = input.todayYmd ?? formatAppIsoDate(new Date());
  const period = resolveMerchantMonitoringPeriod({
    fromYmd: input.fromYmd,
    toYmd: input.toYmd,
    preset: input.preset,
    todayYmd,
  });

  const filterAliases = input.assignedMerchant?.trim()
    ? await resolveAssignedMerchantFilterLabels(companyId, input.assignedMerchant.trim())
    : null;
  const filterAliasKeys = filterAliases
    ? new Set(filterAliases.map((a) => norm(a)))
    : null;

  const [aliasToRoster, unallocatedCount, contacts] = await Promise.all([
    buildAliasToRoster(companyId),
    prisma.contactMaster.count({
      where: {
        companyId,
        OR: [{ assignedMerchant: null }, { assignedMerchant: "" }],
      },
    }),
    loadAllocatedContacts(companyId),
  ]);

  const scopedContacts = filterAliasKeys
    ? contacts.filter((c) => {
        const raw = c.assignedMerchant?.trim() ?? "";
        return raw && filterAliasKeys.has(norm(raw));
      })
    : contacts;

  const accumulators = new Map<string, MerchantAccumulator>();
  const ensureMerchant = (value: string, label: string) => {
    const key = norm(value);
    let acc = accumulators.get(key);
    if (!acc) {
      acc = createAccumulator(value, label);
      accumulators.set(key, acc);
    }
    return acc;
  };

  for (const contact of scopedContacts) {
    const raw = contact.assignedMerchant?.trim() ?? "";
    if (!raw) continue;
    const matched = aliasToRoster.get(norm(raw));
    const merchantValue = matched?.value ?? raw;
    const merchantLabel = matched?.label ?? raw;
    const acc = ensureMerchant(merchantValue, merchantLabel);

    acc.allocatedTotal += 1;
    const tierKey = effectiveLoyaltyTierKey(contact.loyaltyAssignedTier);
    bumpTier(acc.tiers, tierKey);
    if (hasDob(contact.birthMonth, contact.birthDay)) acc.dobCompleteCount += 1;
    if (hasEmail(contact.email)) acc.emailCompleteCount += 1;

    const bucket = classifyPurchaseRecencyBucket(
      contact.lastPurchaseAt,
      period.periodEndYmd
    );
    const bucketTiers = acc.recency.get(bucket)!;
    bumpTier(bucketTiers, tierKey);
  }

  const contactIds = scopedContacts.map((c) => c.id);
  const purchasedIds = await purchasedInPeriodContactIds(
    companyId,
    contactIds,
    period.fromYmd,
    period.toYmd,
    scopedContacts
  );

  for (const contact of scopedContacts) {
    if (!purchasedIds.has(contact.id)) continue;
    const raw = contact.assignedMerchant?.trim() ?? "";
    if (!raw) continue;
    const matched = aliasToRoster.get(norm(raw));
    const merchantValue = matched?.value ?? raw;
    const merchantLabel = matched?.label ?? raw;
    const acc = ensureMerchant(merchantValue, merchantLabel);
    acc.purchasedInPeriodCount += 1;
  }

  const portfolioRows = [...accumulators.values()]
    .map(toPortfolioRow)
    .sort((a, b) => {
      if (b.allocatedTotal !== a.allocatedTotal) {
        return b.allocatedTotal - a.allocatedTotal;
      }
      return a.merchantLabel.localeCompare(b.merchantLabel, undefined, {
        sensitivity: "base",
      });
    });

  const recencyRows = [...accumulators.values()]
    .map(toRecencyRow)
    .sort((a, b) =>
      a.merchantLabel.localeCompare(b.merchantLabel, undefined, {
        sensitivity: "base",
      })
    );

  const companyLabel = input.assignedMerchant?.trim()
    ? portfolioRows[0]?.merchantLabel ?? input.assignedMerchant.trim()
    : "All merchants";

  return {
    period,
    generatedAt: new Date().toISOString(),
    unallocatedCount,
    portfolioRows,
    companyPortfolio: sumPortfolioRows(portfolioRows, companyLabel),
    recencyRows,
    companyRecency: sumRecencyCells([...accumulators.values()]),
  };
}

export {
  defaultMtdPeriod,
  resolveMerchantMonitoringPeriod,
  MerchantMonitoringPeriodError,
} from "@/lib/customer-insight/merchant-monitoring-period";
