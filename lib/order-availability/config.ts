import { DEFAULT_CAP_LKR, DEFAULT_OPTION_COUNT } from "@/lib/order-availability/types";

export type OrderAvailabilityConfig = {
  capLkr: number;
  optionCount: number;
};

/** Optional per-deployment overrides; invalid values fall back to the defaults. */
export function readOrderAvailabilityConfig(
  env: Record<string, string | undefined> = process.env,
): OrderAvailabilityConfig {
  const cap = Number(env.ORDER_AVAILABILITY_CAP_LKR);
  const count = Number(env.ORDER_AVAILABILITY_OPTION_COUNT);
  return {
    capLkr: env.ORDER_AVAILABILITY_CAP_LKR && Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_CAP_LKR,
    optionCount:
      env.ORDER_AVAILABILITY_OPTION_COUNT && Number.isInteger(count) && count >= 1 && count <= 5
        ? count
        : DEFAULT_OPTION_COUNT,
  };
}
