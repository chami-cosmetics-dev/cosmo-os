import {
  getPaymentMethodInfo,
  isCardOnDeliveryGateway,
  type PaymentMethodChangeTarget,
} from "@/lib/payment-method-label";

export const COLLECTION_GATEWAY_CASH = "Cash on Delivery (COD)";
export const COLLECTION_GATEWAY_CARD = "Card Payment on Delivery";
export const COLLECTION_GATEWAY_BANK = "bank_transfer";

export type RiderLinkPaymentKind = "cash" | "card_on_delivery";
export type RiderLinkPaymentTarget = "cash" | "card_on_delivery" | "bank_transfer";

export const RIDER_LINK_PAYMENT_TARGETS: RiderLinkPaymentTarget[] = [
  "cash",
  "card_on_delivery",
  "bank_transfer",
];

export function isRiderLinkPaymentTarget(value: string): value is RiderLinkPaymentTarget {
  return (RIDER_LINK_PAYMENT_TARGETS as string[]).includes(value);
}

export function classifyCollectionPaymentKind(input: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
}): RiderLinkPaymentKind | null {
  if (orderHasCardOnDeliveryCollection(input)) return "card_on_delivery";
  const info = getPaymentMethodInfo(input);
  if (info.variant === "cash" || info.variant === "cod") return "cash";
  return null;
}

function orderHasCardOnDeliveryCollection(input: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
}): boolean {
  if (input.paymentGatewayPrimary && isCardOnDeliveryGateway(input.paymentGatewayPrimary)) {
    return true;
  }
  return (input.paymentGatewayNames ?? []).some((gateway) => isCardOnDeliveryGateway(gateway));
}

export function riderLinkPaymentTargets(kind: RiderLinkPaymentKind): RiderLinkPaymentTarget[] {
  if (kind === "cash") return ["card_on_delivery", "bank_transfer"];
  return ["cash", "bank_transfer"];
}

export function riderLinkPaymentTargetLabel(target: RiderLinkPaymentTarget): string {
  if (target === "cash") return "Cash on delivery";
  if (target === "card_on_delivery") return "Card on delivery";
  return "Bank transfer";
}

export function collectionGatewayForTarget(target: RiderLinkPaymentTarget): string {
  if (target === "cash") return COLLECTION_GATEWAY_CASH;
  if (target === "card_on_delivery") return COLLECTION_GATEWAY_CARD;
  return COLLECTION_GATEWAY_BANK;
}

export function isRiderLinkPaymentChangeAllowed(input: {
  current: RiderLinkPaymentKind | null;
  target: RiderLinkPaymentTarget;
}): boolean {
  if (!input.current) return false;
  if (input.target === input.current) return false;
  return riderLinkPaymentTargets(input.current).includes(input.target);
}

export function pendingPaymentMethodChangeZerosCash(
  target: PaymentMethodChangeTarget | null | undefined,
): boolean {
  return target === "bank_transfer" || target === "koko" || target === "mintpay";
}

export function financeMopKeyToCollectionTarget(
  mopKey: string | null | undefined,
): RiderLinkPaymentTarget | null {
  if (mopKey === "cash" || mopKey === "cod") return "cash";
  if (mopKey === "card_delivery") return "card_on_delivery";
  if (mopKey === "bank_transfer") return "bank_transfer";
  return null;
}

export const FINANCE_PAYMENT_METHOD_CHANGE_PENDING =
  "Finance approval is pending for this payment method change.";
