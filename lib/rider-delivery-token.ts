import { randomBytes } from "crypto";

/** New SMS links only. Old 32-char hex tokens stay on the confirm-only page. */
export const RIDER_DELIVERY_PAYMENT_CHANGE_PREFIX = "p1";

export function createRiderDeliveryToken(): string {
  return `${RIDER_DELIVERY_PAYMENT_CHANGE_PREFIX}${randomBytes(16).toString("hex")}`;
}

export function riderDeliveryTokenAllowsPaymentChange(token: string): boolean {
  return token.startsWith(RIDER_DELIVERY_PAYMENT_CHANGE_PREFIX);
}
