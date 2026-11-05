import { shouldSkipDeliveryPaymentApproval } from "@/lib/delivery-payment-approval";
import { getDiscountCouponCode } from "@/lib/shopify-discount-codes";
import { inferExpectedPaymentMethod } from "@/lib/mobile/payment";
import type { DeliveryPaymentMethod } from "@prisma/client";

export type MobileCollectionKind = "prepaid" | "partial" | "full";

export type MobileCollectResolution = {
  amount: number;
  expectedPaymentMethod: DeliveryPaymentMethod;
  collectionKind: MobileCollectionKind;
  discountCouponCode: string | null;
  allowedPaymentMethods: DeliveryPaymentMethod[];
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * What the rider must collect at the door.
 * - Partial (KOKO/Bank + cash): cash leg only
 * - Fully prepaid (KOKO, Mintpay, bank, CC, …): Rs. 0
 * - Else: full order total
 */
export function resolveMobileCollectAmount(input: {
  totalPrice: number | string | { toString(): string };
  collectCashAmount?: number | null;
  discountCodes?: unknown;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[];
  financialStatus?: string | null;
}): MobileCollectResolution {
  const total = Number(input.totalPrice?.toString?.() ?? input.totalPrice);
  const safeTotal = Number.isFinite(total) ? roundMoney(total) : 0;
  const cash =
    input.collectCashAmount != null && Number.isFinite(input.collectCashAmount)
      ? roundMoney(input.collectCashAmount)
      : null;
  const discountCouponCode = getDiscountCouponCode(input.discountCodes) ?? null;
  const orderGateways = {
    paymentGatewayPrimary: input.paymentGatewayPrimary ?? null,
    paymentGatewayNames: input.paymentGatewayNames ?? [],
    financialStatus: input.financialStatus ?? null,
  };

  if (cash != null && cash > 0) {
    return {
      amount: cash,
      expectedPaymentMethod: "cod",
      collectionKind: "partial",
      discountCouponCode,
      allowedPaymentMethods: allowedMethodsForCollect({
        collectionKind: "partial",
        discountCouponCode,
      }),
    };
  }

  const inferred = inferExpectedPaymentMethod(orderGateways);
  const prepaid =
    shouldSkipDeliveryPaymentApproval(orderGateways) || inferred === "already_paid";

  if (prepaid) {
    return {
      amount: 0,
      expectedPaymentMethod: "already_paid",
      collectionKind: "prepaid",
      discountCouponCode,
      allowedPaymentMethods: ["already_paid"],
    };
  }

  return {
    amount: safeTotal,
    expectedPaymentMethod: inferred,
    collectionKind: "full",
    discountCouponCode,
    allowedPaymentMethods: allowedMethodsForCollect({
      collectionKind: "full",
      discountCouponCode,
    }),
  };
}

/** Coupon COD (and door cash on coupon orders): Cash + Bank only — no Card (rule B). */
export function allowedMethodsForCollect(input: {
  collectionKind: MobileCollectionKind;
  discountCouponCode: string | null;
}): DeliveryPaymentMethod[] {
  if (input.collectionKind === "prepaid") return ["already_paid"];
  if (input.discountCouponCode) return ["cod", "bank_transfer"];
  if (input.collectionKind === "partial") return ["cod", "bank_transfer", "card"];
  return ["cod", "bank_transfer", "card", "already_paid"];
}

export function assertPaymentMethodsAllowed(
  lines: Array<{ paymentMethod: DeliveryPaymentMethod }>,
  allowed: DeliveryPaymentMethod[],
): string | null {
  const allowedSet = new Set(allowed);
  for (const line of lines) {
    if (!allowedSet.has(line.paymentMethod)) {
      if (line.paymentMethod === "card" && !allowedSet.has("card")) {
        return "Card is not allowed on coupon COD orders. Use cash or bank transfer.";
      }
      return `Payment method ${line.paymentMethod} is not allowed for this delivery`;
    }
  }
  return null;
}
