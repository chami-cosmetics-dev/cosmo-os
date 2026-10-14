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
  giftVoucherCode: {
    select: { code: true, usedAt: true, group: { select: { name: true } } },
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

function toApplied(order: OrderForVoucher): OrderGiftVoucherApplied | null {
  const applied = order.giftVoucherCode;
  if (!applied) return null;
  return {
    code: applied.code,
    groupName: applied.group.name,
    usedAt: applied.usedAt?.toISOString() ?? null,
  };
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
 * Apply a batch code to an order. Validation and the USED update run in one transaction,
 * and the update only succeeds while the code is still unused, so two orders can never
 * redeem the same code. The unique orderId keeps it to one batch code per order.
 */
export async function applyGiftVoucherToOrder(input: {
  companyId: string;
  orderId: string;
  actorUserId: string | null;
  code: string;
}): Promise<Result<OrderGiftVoucherApplied>> {
  const { companyId } = input;
  const code = normalizeVoucherCode(input.code);

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId },
    select: orderSelect,
  });
  if (!order) return { ok: false, status: 404, error: "Order not found." };
  if (order.giftVoucherCode) {
    return {
      ok: false,
      status: 409,
      error: `This order already has batch code ${order.giftVoucherCode.code}.`,
    };
  }

  const { matchedPrefixes } = await matchVoucherCoupons(companyId, orderCoupons(order));
  if (matchedPrefixes.length === 0) {
    return { ok: false, status: 400, error: "This order has no gift voucher coupon." };
  }

  const orderNo = resolveOrderNumber(order) || order.id;
  const phoneNo = resolveCustomerPhone(order) ?? null;
  const usedAt = new Date();

  let applied: { code: string; groupName: string };
  try {
    applied = await prisma.$transaction(async (tx) => {
      const found = await tx.giftVoucherCode.findUnique({
        where: { companyId_code: { companyId, code } },
        select: {
          id: true,
          used: true,
          orderNo: true,
          group: { select: { name: true, codePrefix: true, startDate: true, endDate: true } },
        },
      });
      if (!found) throw new ApplyError(`Batch code ${code} was not found.`, 404);

      if (!matchedPrefixes.includes(found.group.codePrefix)) {
        throw new ApplyError(
          `Batch code ${code} belongs to a different group ("${found.group.name}") that does not match this order's coupon.`,
          400,
        );
      }

      const startDate = dateOnlyString(found.group.startDate);
      const endDate = dateOnlyString(found.group.endDate);
      const status = deriveGiftVoucherStatus({
        used: found.used,
        startDate,
        endDate,
        today: formatAppIsoDate(usedAt),
      });
      if (status === "USED") {
        throw new ApplyError(
          `Batch code ${code} is already used${found.orderNo ? ` on order ${found.orderNo}` : ""}.`,
          409,
        );
      }
      if (status === "EXPIRED") throw new ApplyError(`Batch code ${code} expired on ${endDate}.`, 400);
      if (status === "PENDING") {
        throw new ApplyError(`Batch code ${code} is not active until ${startDate}.`, 400);
      }

      // Conditional update: only one concurrent request can flip an unused code to USED.
      const updated = await tx.giftVoucherCode.updateMany({
        where: { id: found.id, used: false },
        data: { used: true, orderId: order.id, orderNo, phoneNo, usedAt },
      });
      if (updated.count === 0) {
        throw new ApplyError(`Batch code ${code} was just used on another order.`, 409);
      }

      return { code, groupName: found.group.name };
    });
  } catch (error) {
    if (error instanceof ApplyError) return { ok: false, status: error.status, error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, status: 409, error: "This order already has a batch code." };
    }
    throw error;
  }

  await writeAuditLog({
    companyId,
    actorUserId: input.actorUserId,
    module: "products",
    action: "gift_voucher_code_used",
    entityType: "gift_voucher_code",
    entityId: applied.code,
    summary: `Gift voucher ${applied.code} (${applied.groupName}) applied to order ${orderNo}`,
    afterData: { code: applied.code, group: applied.groupName, orderId: order.id, orderNo, phoneNo, usedAt },
  });

  return { ok: true, data: { ...applied, usedAt: usedAt.toISOString() } };
}
