import "server-only";

import { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit-log";
import { formatAppIsoDate } from "@/lib/format-datetime";
import {
  couponPrefix,
  deriveGiftVoucherStatus,
  normalizeVoucherCode,
  type OrderGiftVoucherApplied,
  type OrderGiftVoucherState,
} from "@/lib/gift-vouchers/types";
import { getErpDiscountCouponFromPayload } from "@/lib/order-discount-coupon";
import { resolveCustomerPhone, resolveOrderNumber } from "@/lib/order-sms-resolvers";
import { prisma } from "@/lib/prisma";
import { parseShopifyDiscountCodes } from "@/lib/shopify-discount-codes";

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const orderSelect = {
  id: true,
  name: true,
  orderNumber: true,
  shopifyOrderId: true,
  erpnextCustomerId: true,
  sourceName: true,
  discountCodes: true,
  rawPayload: true,
  customerPhone: true,
  shippingAddress: true,
  billingAddress: true,
  giftVoucherCodes: {
    select: { code: true, usedAt: true, group: { select: { name: true } } },
    orderBy: [{ usedAt: "asc" }, { code: "asc" }],
  },
} satisfies Prisma.OrderSelect;

type OrderForVoucher = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

function dateOnlyString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Every coupon on the order: Shopify discount codes plus the ERP coupon fields. */
function orderCoupons(order: OrderForVoucher): string[] {
  const coupons = parseShopifyDiscountCodes(order.discountCodes).map((entry) => entry.code);
  if (order.sourceName?.startsWith("erpnext")) {
    const erpCoupon = getErpDiscountCouponFromPayload(order.rawPayload);
    if (erpCoupon) coupons.push(erpCoupon);
  }
  return [...new Set(coupons)];
}

function toApplied(order: OrderForVoucher): OrderGiftVoucherApplied[] {
  return order.giftVoucherCodes.map((applied) => ({
    code: applied.code,
    groupName: applied.group.name,
    usedAt: applied.usedAt?.toISOString() ?? null,
  }));
}

/** Coupons whose first word matches a voucher group prefix, and the prefixes they matched. */
async function matchVoucherCoupons(companyId: string, coupons: string[]) {
  const prefixes = [...new Set(coupons.map(couponPrefix).filter((p): p is string => Boolean(p)))];
  if (prefixes.length === 0) return { matchedCoupons: [], matchedPrefixes: [] };

  // Prefixes are stored uppercase, so an uppercased coupon word is a case-insensitive match.
  const groups = await prisma.giftVoucherGroup.findMany({
    where: { companyId, codePrefix: { in: prefixes } },
    select: { codePrefix: true },
  });
  const matchedPrefixes = [...new Set(groups.map((g) => g.codePrefix))];
  const matchedCoupons = coupons.filter((c) => matchedPrefixes.includes(couponPrefix(c) ?? ""));
  return { matchedCoupons, matchedPrefixes };
}

export async function getOrderGiftVoucherState(input: {
  companyId: string;
  orderId: string;
  canApply: boolean;
}): Promise<OrderGiftVoucherState | null> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: orderSelect,
  });
  if (!order) return null;

  const { matchedCoupons } = await matchVoucherCoupons(input.companyId, orderCoupons(order));
  return {
    matchedCoupons,
    applied: toApplied(order),
    canApply: input.canApply,
  };
}

class ApplyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Apply one or more batch codes to an order. Every code is validated and flipped to USED in a
 * single transaction, so either all of them are applied or none are. Each update only succeeds
 * while that code is still unused, so two orders can never redeem the same code.
 */
export async function applyGiftVouchersToOrder(input: {
  companyId: string;
  orderId: string;
  actorUserId: string | null;
  codes: string[];
}): Promise<Result<OrderGiftVoucherApplied[]>> {
  const { companyId } = input;
  const codes = [...new Set(input.codes.map(normalizeVoucherCode).filter(Boolean))];
  if (codes.length === 0) return { ok: false, status: 400, error: "Enter at least one batch code." };

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId },
    select: orderSelect,
  });
  if (!order) return { ok: false, status: 404, error: "Order not found." };

  const { matchedPrefixes } = await matchVoucherCoupons(companyId, orderCoupons(order));
  if (matchedPrefixes.length === 0) {
    return { ok: false, status: 400, error: "This order has no gift voucher coupon." };
  }

  const orderNo = resolveOrderNumber(order) || order.id;
  const phoneNo = resolveCustomerPhone(order) ?? null;
  const usedAt = new Date();
  const today = formatAppIsoDate(usedAt);

  let applied: { code: string; groupName: string }[];
  try {
    applied = await prisma.$transaction(async (tx) => {
      const found = await tx.giftVoucherCode.findMany({
        where: { companyId, code: { in: codes } },
        select: {
          id: true,
          code: true,
          used: true,
          orderId: true,
          orderNo: true,
          group: { select: { name: true, codePrefix: true, startDate: true, endDate: true } },
        },
      });
      const byCode = new Map(found.map((row) => [row.code, row]));

      for (const code of codes) {
        const row = byCode.get(code);
        if (!row) throw new ApplyError(`Batch code ${code} was not found.`, 404);

        if (!matchedPrefixes.includes(row.group.codePrefix)) {
          throw new ApplyError(
            `Batch code ${code} belongs to a different group ("${row.group.name}") that does not match this order's coupon.`,
            400,
          );
        }

        const startDate = dateOnlyString(row.group.startDate);
        const endDate = dateOnlyString(row.group.endDate);
        const status = deriveGiftVoucherStatus({ used: row.used, startDate, endDate, today });
        if (status === "USED") {
          const where = row.orderId === order.id ? "on this order" : row.orderNo ? `on order ${row.orderNo}` : "";
          throw new ApplyError(`Batch code ${code} is already used${where ? ` ${where}` : ""}.`, 409);
        }
        if (status === "EXPIRED") throw new ApplyError(`Batch code ${code} expired on ${endDate}.`, 400);
        if (status === "PENDING") {
          throw new ApplyError(`Batch code ${code} is not active until ${startDate}.`, 400);
        }
      }

      // Conditional updates: only one concurrent request can flip an unused code to USED,
      // and any failure here rolls back the codes already updated in this transaction.
      for (const code of codes) {
        const row = byCode.get(code)!;
        const updated = await tx.giftVoucherCode.updateMany({
          where: { id: row.id, used: false },
          data: { used: true, orderId: order.id, orderNo, phoneNo, usedAt },
        });
        if (updated.count === 0) {
          throw new ApplyError(`Batch code ${code} was just used on another order.`, 409);
        }
      }

      return codes.map((code) => ({ code, groupName: byCode.get(code)!.group.name }));
    });
  } catch (error) {
    if (error instanceof ApplyError) return { ok: false, status: error.status, error: error.message };
    throw error;
  }

  for (const row of applied) {
    await writeAuditLog({
      companyId,
      actorUserId: input.actorUserId,
      module: "products",
      action: "gift_voucher_code_used",
      entityType: "gift_voucher_code",
      entityId: row.code,
      summary: `Gift voucher ${row.code} (${row.groupName}) applied to order ${orderNo}`,
      afterData: { code: row.code, group: row.groupName, orderId: order.id, orderNo, phoneNo, usedAt },
    });
  }

  return {
    ok: true,
    data: applied.map((row) => ({ ...row, usedAt: usedAt.toISOString() })),
  };
}

const SUGGESTION_LIMIT = 10;

/**
 * Batch codes that could be applied to this order right now and contain the typed text:
 * unused, active today, and in a group whose prefix matches one of the order's coupons.
 */
export async function suggestGiftVoucherCodes(input: {
  companyId: string;
  orderId: string;
  query: string;
}): Promise<{ code: string; groupName: string }[]> {
  const { companyId } = input;
  const query = normalizeVoucherCode(input.query);
  if (!query) return [];
  // Generated codes have no dashes, so "COS-143" should still find COS143xxxxx codes.
  const undashed = query.replace(/-/g, "");

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId },
    select: orderSelect,
  });
  if (!order) return [];

  const { matchedPrefixes } = await matchVoucherCoupons(companyId, orderCoupons(order));
  if (matchedPrefixes.length === 0) return [];

  const today = new Date(`${formatAppIsoDate(new Date())}T00:00:00.000Z`);
  const rows = await prisma.giftVoucherCode.findMany({
    where: {
      companyId,
      used: false,
      OR: [
        { code: { contains: query } },
        ...(undashed && undashed !== query ? [{ code: { contains: undashed } }] : []),
      ],
      group: {
        codePrefix: { in: matchedPrefixes },
        startDate: { lte: today },
        endDate: { gte: today },
      },
    },
    orderBy: { code: "asc" },
    take: SUGGESTION_LIMIT,
    select: { code: true, group: { select: { name: true } } },
  });
  return rows.map((row) => ({ code: row.code, groupName: row.group.name }));
}
