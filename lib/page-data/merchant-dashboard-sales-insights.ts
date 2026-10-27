import { isDashboardSalesOrderEligible } from "@/lib/page-data/dashboard-sales";
import { listLastYearMonths, monthBounds } from "@/lib/page-data/merchant-dashboard-history";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { isPosOrderSource } from "@/lib/fulfillment-queue-filters";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import {
  classifyMerchantSalesBucket,
  parseOrderCouponList,
  splitMerchantCouponSets,
} from "@/lib/merchant-dm-sales";
import {
  isWholesaleTrackingCode,
  orderIsWholesale,
} from "@/lib/merchant-wholesale";
import { prisma } from "@/lib/prisma";

/** Current month + this many past months (3 months total) are selectable for compare. */
export const SALES_INSIGHTS_MONTHS_BACK = 2;

export type SalesTotals = { total: number; orderCount: number };

export type SalesInsightsDay = {
  ymd: string;
  /** Invoiced (created) that day. */
  invoice: SalesTotals;
  /** Delivery completed that day. */
  delivered: SalesTotals;
};

export type MerchantSalesInsights = {
  todayYmd: string;
  /** First selectable day (1st of the month SALES_INSIGHTS_MONTHS_BACK ago). */
  windowFromYmd: string;
  cancelled: { today: SalesTotals; mtd: SalesTotals };
  /** Every Colombo day windowFromYmd..todayYmd, oldest first — client sums any range. */
  days: SalesInsightsDay[];
};

export type InsightsSourceOrder = {
  amount: number;
  createdYmd: string;
  /** Counted as invoice-date sale (paid / pending / partially paid). */
  eligible: boolean;
  /** Colombo day the order was delivered; null when not delivery-complete. */
  deliveredYmd: string | null;
  /** Colombo day the order was cancelled; null when not cancelled. */
  cancelledYmd: string | null;
};

function emptyTotals(): SalesTotals {
  return { total: 0, orderCount: 0 };
}

function add(target: SalesTotals, amount: number) {
  target.total += amount;
  target.orderCount += 1;
}

export function salesInsightsWindowFrom(todayYmd: string): string {
  const months = listLastYearMonths(todayYmd.slice(0, 7), SALES_INSIGHTS_MONTHS_BACK + 1);
  return monthBounds(months[0]).fromYmd;
}

function listDays(fromYmd: string, toYmd: string): string[] {
  const days: string[] = [];
  const [y, m, d] = fromYmd.split("-").map(Number);
  for (let i = 0; ; i += 1) {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    const ymd = date.toISOString().slice(0, 10);
    if (ymd > toYmd) break;
    days.push(ymd);
  }
  return days;
}

/**
 * Invoice basis = created day. Delivered basis = delivery-complete day
 * (POS counter sales count as delivered on the sale day).
 * Cancellations are dated by the day they were cancelled.
 */
export function buildMerchantSalesInsights(input: {
  todayYmd: string;
  orders: InsightsSourceOrder[];
}): MerchantSalesInsights {
  const { todayYmd } = input;
  const windowFromYmd = salesInsightsWindowFrom(todayYmd);
  const currentYearMonth = todayYmd.slice(0, 7);

  const byDay = new Map<string, SalesInsightsDay>(
    listDays(windowFromYmd, todayYmd).map((ymd) => [
      ymd,
      { ymd, invoice: emptyTotals(), delivered: emptyTotals() },
    ]),
  );
  const cancelled = { today: emptyTotals(), mtd: emptyTotals() };

  for (const order of input.orders) {
    if (order.eligible) {
      const day = byDay.get(order.createdYmd);
      if (day) add(day.invoice, order.amount);
    }
    if (order.deliveredYmd) {
      const day = byDay.get(order.deliveredYmd);
      if (day) add(day.delivered, order.amount);
    }
    if (order.cancelledYmd && order.cancelledYmd <= todayYmd) {
      if (order.cancelledYmd.startsWith(currentYearMonth)) {
        add(cancelled.mtd, order.amount);
      }
      if (order.cancelledYmd === todayYmd) add(cancelled.today, order.amount);
    }
  }

  return {
    todayYmd,
    windowFromYmd,
    cancelled,
    days: [...byDay.values()],
  };
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isReturned(stage: string | null): boolean {
  const s = normalize(stage);
  return s === "returned" || s === "returned_to_store";
}

export async function fetchMerchantSalesInsights(
  companyId: string,
  merchantUserId: string,
  params?: { todayYmd?: string },
): Promise<MerchantSalesInsights> {
  const todayYmd = params?.todayYmd ?? formatAppIsoDate(new Date());
  const empty = buildMerchantSalesInsights({ todayYmd, orders: [] });

  const merchant = await prisma.user.findFirst({
    where: { id: merchantUserId, companyId },
    select: { id: true, couponCodes: true },
  });
  if (!merchant) return empty;

  const sets = splitMerchantCouponSets(
    merchant.couponCodes.filter((code) => !isWholesaleTrackingCode(code)),
  );

  const fromDate = new Date(`${empty.windowFromYmd}T00:00:00.000+05:30`);
  const toDate = new Date(`${todayYmd}T23:59:59.999+05:30`);
  const inRange = { gte: fromDate, lte: toDate };

  // Delivered / cancelled in the window may have been created before it.
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      OR: [
        { createdAt: inRange },
        { deliveryCompleteAt: inRange },
        { cancelledAt: inRange },
      ],
    },
    select: {
      totalPrice: true,
      createdAt: true,
      updatedAt: true,
      cancelledAt: true,
      assignedMerchantId: true,
      companyLocation: {
        select: { name: true, defaultMerchantUserId: true },
      },
      sourceName: true,
      financialStatus: true,
      fulfillmentStatus: true,
      fulfillmentStage: true,
      deliveryCompleteAt: true,
      invoiceCompleteAt: true,
      discountCodes: true,
      rawPayload: true,
    },
  });

  const rows: InsightsSourceOrder[] = [];
  for (const order of orders) {
    const merchantCouponCode = getMerchantCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
      assignedMerchantCouponCodes: null,
      joinAllDiscountCodes: true,
    });
    const orderCoupons = parseOrderCouponList(merchantCouponCode);
    if (orderIsWholesale(orderCoupons)) continue;
    const bucket = classifyMerchantSalesBucket({
      orderCoupons,
      personal: sets.personal,
      dm: sets.dm,
      hasDm: sets.hasDm,
      assignedToViewer: order.assignedMerchantId === merchantUserId,
      locationName: order.companyLocation?.name,
      locationDefaultIsViewer:
        order.companyLocation?.defaultMerchantUserId === merchantUserId,
    });
    if (!bucket) continue;

    const eligible = isDashboardSalesOrderEligible(order, "all_orders");
    const isCancelled =
      !isReturned(order.fulfillmentStage) &&
      (order.cancelledAt != null || normalize(order.financialStatus) === "voided");

    let deliveredAt: Date | null = null;
    if (eligible && !isCancelled) {
      if (isPosOrderSource(order.sourceName)) {
        deliveredAt = order.deliveryCompleteAt ?? order.createdAt;
      } else if (
        normalize(order.fulfillmentStage) === "delivery_complete" &&
        order.deliveryCompleteAt
      ) {
        deliveredAt = order.deliveryCompleteAt;
      }
    }

    rows.push({
      amount: Number(order.totalPrice ?? 0),
      createdYmd: formatAppIsoDate(order.createdAt),
      eligible,
      deliveredYmd: deliveredAt ? formatAppIsoDate(deliveredAt) : null,
      cancelledYmd: isCancelled
        ? formatAppIsoDate(order.cancelledAt ?? order.updatedAt)
        : null,
    });
  }

  return buildMerchantSalesInsights({ todayYmd, orders: rows });
}
