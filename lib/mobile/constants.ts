export const MOBILE_SESSION_TTL_DAYS = 30;

export const MOBILE_DELIVERY_STATUSES = [
  "assigned",
  "accepted",
  "arrived",
  "completed",
  "failed",
] as const;

export const MOBILE_PAYMENT_METHODS = [
  "cod",
  "bank_transfer",
  "card",
  "already_paid",
] as const;

export const MOBILE_COLLECTION_STATUSES = [
  "pending",
  "collected",
  "partially_collected",
  "not_collected",
] as const;
