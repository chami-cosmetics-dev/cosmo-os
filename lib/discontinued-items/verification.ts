/** Phase 5: Shopify check of Draft clicks. Pure, client-safe. */

/**
 * Draft clicks are checked once a day at 5:30 PM Sri Lanka time (vercel.json cron "0 12 * * *",
 * 12:00 UTC = 17:30 Asia/Colombo). Each run checks every click not checked yet, so a day with no
 * Draft clicks has nothing to check; a click after 5:30 PM is checked at the next day's run.
 */
export const VERIFY_TIME_LABEL = "5:30 PM";

/** Shopify product status → result: Draft = pass; Active or Archived = fail (mismatch); else not decided. */
export function verdictOfShopifyStatus(status: string | null | undefined): "PASS" | "FAIL" | null {
  const value = (status ?? "").trim().toUpperCase();
  if (value === "DRAFT") return "PASS";
  if (value === "ACTIVE" || value === "ARCHIVED") return "FAIL";
  return null;
}

/** Shopify search query for a batch of handles (exact handles are re-checked on the results). */
export function handlesQuery(handles: string[]): string {
  return handles.map((handle) => `handle:"${handle.replace(/["\\]/g, "")}"`).join(" OR ");
}
