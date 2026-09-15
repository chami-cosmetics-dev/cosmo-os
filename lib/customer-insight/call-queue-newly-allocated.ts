import { addCalendarMonthsUtc } from "@/lib/customer-insight/call-queue-hide";

/**
 * Show "Newly allocated" when the queue row was flagged (cross-merchant assign)
 * and nobody contacted the contact within the last 2 calendar months.
 * After the new merchant call-updates, the pending queue row completes and the
 * badge disappears with it; last contacted updates via ContactAllocationUpdate.
 */
export function shouldShowNewlyAllocatedBadge(input: {
  newlyAllocated: boolean;
  lastContactedAt: Date | null;
  now?: Date;
}): boolean {
  if (!input.newlyAllocated) return false;
  const now = input.now ?? new Date();
  const last = input.lastContactedAt;
  if (!last) return true;
  return now >= addCalendarMonthsUtc(last, 2);
}

/** True when Contact Master allocation already points at this merchant. */
export function contactAllocatedToMerchantAliases(
  assignedMerchant: string | null | undefined,
  aliases: string[]
): boolean {
  const raw = (assignedMerchant ?? "").trim().toLowerCase();
  if (!raw) return false;
  return aliases.some((a) => a.trim().toLowerCase() === raw);
}
