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

/** Current month + this many months back for the compare picker. */
export const SALES_INSIGHTS_MONTHS_BACK = 3;

export type SalesTotals = { total: number; orderCount: number };

export type SalesInsightsMonth = {
  yearMonth: string;
  /** Whole month (current month = through today). */
  invoice: SalesTotals;
  delivered: SalesTotals;
  /** Day 1 through today's day-of-month — fair compare against a part month. */
  invoiceToDate: SalesTotals;
  deliveredToDate: SalesTotals;
};

export type MerchantSalesInsights = {
  todayYmd: string;
  dayOfMonth: number;
  today: { invoice: SalesTotals; delivered: SalesTotals };
  cancelled: { today: SalesTotals; mtd: SalesTotals };
  /** Newest first: current month, then up to 3 back. */
  months: SalesInsightsMonth[];
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

function dayOf(ymd: string): number {
  return Number(ymd.slice(8, 10));
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
  const currentYearMonth = todayYmd.slice(0, 7);
  const dayOfMonth = dayOf(todayYmd);
  const yearMonths = listLastYearMonths(
    currentYearMonth,
    SALES_INSIGHTS_MONTHS_BACK + 1,
  ).reverse();

  const byMonth = new Map<string, SalesInsightsMonth>(
    yearMonths.map((ym) => [
      ym,
      {
        yearMonth: ym,
        invoice: emptyTotals(),
        delivered: emptyTotals(),
        invoiceToDate: emptyTotals(),
        deliveredToDate: emptyTotals(),
      },
    ]),
  );
  const today = { invoice: emptyTotals(), delivered: emptyTotals() };
  const cancelled = { today: emptyTotals(), mtd: emptyTotals() };

  const inWindow = (ymd: string) => ymd <= todayYmd;

  for (const order of input.orders) {
    if (order.eligible && inWindow(order.createdYmd)) {
      const month = byMonth.get(order.createdYmd.slice(0, 7));
      if (month) {
        add(month.invoice, order.amount);
        if (dayOf(order.createdYmd) <= dayOfMonth) {
          add(month.invoiceToDate, order.amount);
        }
      }
      if (order.createdYmd === todayYmd) add(today.invoice, order.amount);
    }

    if (order.deliveredYmd && inWindow(order.deliveredYmd)) {
      const month = byMonth.get(order.deliveredYmd.slice(0, 7));
      if (month) {
        add(month.delivered, order.amount);
        if (dayOf(order.deliveredYmd) <= dayOfMonth) {
          add(month.deliveredToDate, order.amount);
        }
      }
      if (order.deliveredYmd === todayYmd) add(today.delivered, order.amount);
    }

    if (order.cancelledYmd && inWindow(order.cancelledYmd)) {
      if (order.cancelledYmd.startsWith(currentYearMonth)) {
        add(cancelled.mtd, order.amount);
      }
      if (order.cancelledYmd === todayYmd) add(cancelled.today, order.amount);
    }
  }

  return {
    todayYmd,
    dayOfMonth,
    today,
    cancelled,
    months: yearMonths.map((ym) => byMonth.get(ym)!),
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

  const oldestYearMonth = empty.months[empty.months.length - 1].yearMonth;
  const fromDate = new Date(`${monthBounds(oldestYearMonth).fromYmd}T00:00:00.000+05:30`);
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
