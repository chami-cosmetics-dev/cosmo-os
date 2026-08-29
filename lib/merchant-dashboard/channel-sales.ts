import type { CohortMerchantTotals } from "@/lib/page-data/merchant-dashboard-peers";

export type ChannelSalesBucket = {
  orderCount: number;
  amount: number;
};

export type MerchantChannelSales = {
  shop: ChannelSalesBucket;
  online: ChannelSalesBucket;
};

const EMPTY_BUCKET: ChannelSalesBucket = { orderCount: 0, amount: 0 };

const POS_SOURCE_NAMES = new Set(["pos", "erpnext-pos"]);

/** POS / ERPNext POS orders count as shop channel sales. */
export function isPosChannelOrder(sourceName: string | null | undefined): boolean {
  const normalized = (sourceName ?? "").trim().toLowerCase();
  return POS_SOURCE_NAMES.has(normalized);
}

export function emptyChannelSales(): MerchantChannelSales {
  return { shop: { ...EMPTY_BUCKET }, online: { ...EMPTY_BUCKET } };
}

/** @deprecated Cosmetics.lk location ids — channel split now uses order source (POS vs web). */
export function resolveCosmeticsLkLocationIds(
  locationNames: Map<string, string>,
): Set<string> {
  const ids = new Set<string>();
  for (const [id, name] of locationNames) {
    if (/cosmetics\.?\s*lk/i.test((name ?? "").trim())) ids.add(id);
  }
  return ids;
}

/** Shop = POS orders; online = all other attributed orders. */
export function splitMerchantChannelSales(
  merchantRow: CohortMerchantTotals | undefined,
): MerchantChannelSales {
  if (!merchantRow) return emptyChannelSales();
  return {
    shop: { ...merchantRow.byChannel.shop },
    online: { ...merchantRow.byChannel.online },
  };
}

export function addMerchantChannelSales(
  base: MerchantChannelSales,
  extra: MerchantChannelSales,
): MerchantChannelSales {
  return {
    shop: {
      amount: base.shop.amount + extra.shop.amount,
      orderCount: base.shop.orderCount + extra.shop.orderCount,
    },
    online: {
      amount: base.online.amount + extra.online.amount,
      orderCount: base.online.orderCount + extra.online.orderCount,
    },
  };
}

/** Merge personal cohort row with DM-General bucket for DM holders. */
export function mergeMerchantCohortWithDmBucket(input: {
  merchantRow: CohortMerchantTotals | undefined;
  dmRow: CohortMerchantTotals | undefined;
  dmShare: number;
}): { total: number; orderCount: number; channel: MerchantChannelSales } {
  const { merchantRow, dmRow, dmShare } = input;
  let total = merchantRow?.total ?? 0;
  let orderCount = merchantRow?.orderCount ?? 0;
  let channel = splitMerchantChannelSales(merchantRow);

  if (dmRow && dmShare > 0) {
    total += dmRow.total * dmShare;
    if (dmShare === 1) {
      orderCount += dmRow.orderCount;
      channel = addMerchantChannelSales(channel, splitMerchantChannelSales(dmRow));
    } else {
      orderCount += Math.round(dmRow.orderCount * dmShare);
      const dmChannel = splitMerchantChannelSales(dmRow);
      channel = addMerchantChannelSales(channel, {
        shop: {
          amount: dmChannel.shop.amount * dmShare,
          orderCount: Math.round(dmChannel.shop.orderCount * dmShare),
        },
        online: {
          amount: dmChannel.online.amount * dmShare,
          orderCount: Math.round(dmChannel.online.orderCount * dmShare),
        },
      });
    }
  }

  return { total, orderCount, channel };
}

export function sumChannelBuckets(
  rows: MerchantChannelSales[],
): MerchantChannelSales {
  const out = emptyChannelSales();
  for (const row of rows) {
    out.shop.amount += row.shop.amount;
    out.shop.orderCount += row.shop.orderCount;
    out.online.amount += row.online.amount;
    out.online.orderCount += row.online.orderCount;
  }
  return out;
}

export function resolveEffectiveTotalTarget(input: {
  targetAmount: number | null;
  shopTargetAmount: number | null;
  onlineTargetAmount: number | null;
}): number | null {
  const shop = input.shopTargetAmount;
  const online = input.onlineTargetAmount;
  if ((shop != null && shop > 0) || (online != null && online > 0)) {
    return (shop ?? 0) + (online ?? 0);
  }
  if (input.targetAmount != null && input.targetAmount > 0) {
    return input.targetAmount;
  }
  return null;
}

export function computeChannelPercent(
  actual: number,
  target: number | null,
): number | null {
  if (target == null || target <= 0) return null;
  return Math.round((actual / target) * 1000) / 10;
}

/** Target % when channel target set; else share of merchant shop+online total. */
export function resolveChannelPercent(input: {
  actual: number;
  target: number | null;
  channelTotal: number;
}): number | null {
  if (input.target != null && input.target > 0) {
    return computeChannelPercent(input.actual, input.target);
  }
  if (input.channelTotal > 0) {
    return Math.round((input.actual / input.channelTotal) * 1000) / 10;
  }
  return null;
}
