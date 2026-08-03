import { NextRequest, NextResponse } from "next/server";

import { advanceDueSampleSendLaterOrders } from "@/lib/advance-due-sample-send-later";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Advance sample send-later orders to print once their planned date starts
 * (after previous-day midnight Asia/Colombo).
 *
 * Scheduled hourly so due orders move soon after Colombo midnight.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await advanceDueSampleSendLaterOrders();
  return NextResponse.json({ ok: true, ...result });
}
