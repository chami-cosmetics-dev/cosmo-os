import { NextRequest, NextResponse } from "next/server";

import { runScheduledActiveAgain } from "@/lib/discontinued-items/active-again.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Every 30 minutes. The weekly "active again" check runs once its day / time (set on Item
 * Drafting, default Monday 9:30 AM Asia/Colombo) has passed that week; read-only on Shopify. Items
 * found and not mailed yet are mailed (a failed send is retried on the next tick).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runScheduledActiveAgain()) });
  } catch (error) {
    console.error("[cron] discontinued-items-active-again failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
