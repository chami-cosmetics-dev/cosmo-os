import { NextRequest, NextResponse } from "next/server";

import {
  notifyPendingIfDue,
  notifyShopifyDraftIfNew,
} from "@/lib/discontinued-items/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Hourly. Purchasing pending: weekly reminder while any remain (the first send happens on the
 * button click). SEO: one combined notification when items were newly approved since the last.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const now = new Date();
    const pending = await notifyPendingIfDue(now);
    const shopifyDraft = await notifyShopifyDraftIfNew(now);
    return NextResponse.json({ ok: true, pending, shopifyDraft });
  } catch (error) {
    console.error("[cron] discontinued-items-reminders failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
