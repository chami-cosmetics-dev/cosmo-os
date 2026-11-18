import { NextRequest, NextResponse } from "next/server";

import { sendScheduledNewlyAddedReviewMailForAllCompanies } from "@/lib/newly-added-review/send";

export const dynamic = "force-dynamic";
/** Reads every Newly Added SKU's stock ledger live from the ERPs. */
export const maxDuration = 300;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Newly Added Priority Review — the first Tuesday of each month, 9:00 AM Asia/Colombo
 * (vercel.json "30 3 * * 2" = every Tuesday 03:30 UTC; only the month's send day sends — see
 * newlyAddedReviewSendDate, incl. one-off overrides). At most once per month per company.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await sendScheduledNewlyAddedReviewMailForAllCompanies();
  return NextResponse.json({ ok: results.every((r) => r.status !== "failed"), results });
}
