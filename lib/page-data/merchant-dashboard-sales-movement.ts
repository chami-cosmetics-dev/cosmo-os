import {
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import {
  classifyMerchantSalesBucket,
  parseOrderCouponList,
  splitMerchantCouponSets,
} from "@/lib/merchant-dm-sales";
import { prisma } from "@/lib/prisma";

export type MerchantSalesMovementLine = {
  invoiceLabel: string;
  amount: number;
  kind: "add" | "remove";
  reason: "sale" | "voided" | "return";
};

export type MerchantSalesMovement = {
  todayYmd: string;
  yesterdayYmd: string;
  yearMonth: string;
  openingTotal: number;
  additions: MerchantSalesMovementLine[];
  removals: MerchantSalesMovementLine[];
  additionsTotal: number;
  removalsTotal: number;
  closingTotal: number;
  countedMtd: number;
  countedToday: number;
};

export type MovementSourceOrder = {
  invoiceLabel: string;
  amount: number;
  createdYmd: string;
  updatedYmd: string;
  cancelledYmd: string | null;
  eligible: boolean;
  removalReason: "voided" | "return";
};

const LINE_CAP = 60;

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

export function previousAppIsoDate(ymd: string): string {
  const start = parseDayStartUtc(ymd);
  return formatAppIsoDate(new Date(start.getTime() - 1));
}

function monthFromYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function inMonthThrough(ymd: string, monthFrom: string, toYmd: string): boolean {
  return ymd >= monthFrom && ymd <= toYmd;
}

function leftToday(order: MovementSourceOrder, todayYmd: string, monthFrom: string): boolean {
  if (order.eligible) return false;
  if (!inMonthThrough(order.createdYmd, monthFrom, todayYmd)) return false;
  const eventYmd = order.cancelledYmd ?? order.updatedYmd;
  return eventYmd === todayYmd;
}

function capLines(lines: MerchantSalesMovementLine[]): MerchantSalesMovementLine[] {
  if (lines.length <= LINE_CAP) return lines;
  const kept = lines.slice(0, LINE_CAP);
  const rest = lines.slice(LINE_CAP);
  const restTotal = rest.reduce((sum, row) => sum + row.amount, 0);
  kept.push({
    invoiceLabel: `${rest.length} more`,
    amount: restTotal,
    kind: lines[0]?.kind ?? "add",
    reason: lines[0]?.kind === "remove" ? "voided" : "sale",
  });
  return kept;
}

/**
 * MTD walk for one Colombo day:
 * opening (through yesterday, including invoices that dropped today)
 * + invoices placed today
 * − returns/voids that left the count today
 * = current MTD.
 */
export function buildMerchantSalesMovement(input: {
  todayYmd: string;
  orders: MovementSourceOrder[];
}): MerchantSalesMovement {
  const todayYmd = input.todayYmd;
  const yesterdayYmd = previousAppIsoDate(todayYmd);
  const monthFrom = monthFromYmd(todayYmd);
  const yearMonth = todayYmd.slice(0, 7);

  let openingTotal = 0;
  let countedMtd = 0;
  let countedToday = 0;
  const additions: MerchantSalesMovementLine[] = [];
  const removals: MerchantSalesMovementLine[] = [];

  for (const order of input.orders) {
    const inMonth = inMonthThrough(order.createdYmd, monthFrom, todayYmd);
    if (!inMonth) continue;

    if (order.eligible) {
      countedMtd += order.amount;
      if (order.createdYmd === todayYmd) countedToday += order.amount;
    }

    const droppedToday = leftToday(order, todayYmd, monthFrom);
    const priorDay = order.createdYmd <= yesterdayYmd;

    if (priorDay && (order.eligible || droppedToday)) {
      openingTotal += order.amount;
    }

    if (order.createdYmd === todayYmd) {
      additions.push({
        invoiceLabel: order.invoiceLabel,
        amount: order.amount,
        kind: "add",
        reason: "sale",
      });
    }

    if (droppedToday) {
      removals.push({
        invoiceLabel: order.invoiceLabel,
        amount: order.amount,
        kind: "remove",
        reason: order.removalReason,
      });
    }
  }

  additions.sort((a, b) => b.amount - a.amount);
  removals.sort((a, b) => b.amount - a.amount);

  const additionsTotal = additions.reduce((sum, row) => sum + row.amount, 0);
  const removalsTotal = removals.reduce((sum, row) => sum + row.amount, 0);

  return {
    todayYmd,
    yesterdayYmd,
    yearMonth,
    openingTotal,
    additions: capLines(additions),
    removals: capLines(removals),
    additionsTotal,
    removalsTotal,
    closingTotal: openingTotal + additionsTotal - removalsTotal,
    countedMtd,
    countedToday,
  };
}

function invoiceLabel(order: {
  name: string | null;
  orderNumber: string | null;
  id: string;
}): string {
  const name = order.name?.trim();
  if (name) return name;
  const number = order.orderNumber?.trim();
  if (number) return number;
  return order.id.slice(-8);
}

function removalReason(order: {
  financialStatus: string | null;
  fulfillmentStage: string | null;
}): "voided" | "return" {
  const stage = (order.fulfillmentStage ?? "").trim().toLowerCase();
  if (stage === "returned" || stage === "returned_to_store") return "return";
  return "voided";
}

function orderTrackingCoupons(order: {
  sourceName: string | null;
  discountCodes: unknown;
  rawPayload: unknown;
}): string[] {
  const merchantCouponCode = getMerchantCouponCode({
    sourceName: order.sourceName,
    discountCodes: order.discountCodes,
    rawPayload: order.rawPayload,
    assignedMerchantCouponCodes: null,
    joinAllDiscountCodes: true,
  });
  return parseOrderCouponList(merchantCouponCode);
}

export async function fetchMerchantSalesMovement(
  companyId: string,
  merchantUserId: string,
  params?: { todayYmd?: string },
): Promise<MerchantSalesMovement> {
  const todayYmd = params?.todayYmd ?? formatAppIsoDate(new Date());
  const monthFrom = monthFromYmd(todayYmd);
  const fromDate = parseDayStartUtc(monthFrom);
  const toDate = parseDayEndUtc(todayYmd);

  const empty = buildMerchantSalesMovement({ todayYmd, orders: [] });

  const merchant = await prisma.user.findFirst({
    where: { id: merchantUserId, companyId },
    select: { id: true, couponCodes: true },
  });
  if (!merchant || fromDate > toDate) return empty;

  const sets = splitMerchantCouponSets(merchant.couponCodes);

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      createdAt: { gte: fromDate, lte: toDate },
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
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

  const attributed: MovementSourceOrder[] = [];
  for (const order of orders) {
    const orderCoupons = orderTrackingCoupons(order);
    const bucket = classifyMerchantSalesBucket({
      orderCoupons,
      personal: sets.personal,
      dm: sets.dm,
      hasDm: sets.hasDm,
      assignedToViewer: order.assignedMerchantId === merchantUserId,
    });
    if (!bucket) continue;

    attributed.push({
      invoiceLabel: invoiceLabel(order),
      amount: Number(order.totalPrice ?? 0),
      createdYmd: formatAppIsoDate(order.createdAt),
      updatedYmd: formatAppIsoDate(order.updatedAt),
      cancelledYmd: order.cancelledAt ? formatAppIsoDate(order.cancelledAt) : null,
      eligible: isDashboardSalesOrderEligible(order, "all_orders"),
      removalReason: removalReason(order),
    });
  }

  return buildMerchantSalesMovement({ todayYmd, orders: attributed });
}
