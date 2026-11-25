import { NextRequest, NextResponse } from "next/server";

import { runDraftVerification } from "@/lib/discontinued-items/verification.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Daily at 5:30 PM Sri Lanka time ("0 12 * * *" UTC): checks in Shopify (read-only) every Draft
 * click not verified yet. On a day with no Draft clicks there is nothing to check. Failed checks
 * retry at the next run (or by the Re-check button).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runDraftVerification()) });
  } catch (error) {
    console.error("[cron] discontinued-items-verify failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
