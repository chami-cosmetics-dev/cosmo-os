import { NextRequest, NextResponse } from "next/server";

import { sendScheduledStockHealthMailForAllCompanies } from "@/lib/stock-health/summary-mail";

export const dynamic = "force-dynamic";
/** Regenerates the ERP stock report before sending. */
export const maxDuration = 300;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Mail 1 — Stock Health Weekly Summary (+ Discontinue tracking). Tuesdays 9:00 AM Asia/Colombo
 * (vercel.json "30 3 * * 2", UTC). Once per Tuesday; saves the weekly snapshot.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await sendScheduledStockHealthMailForAllCompanies("weekly");
  return NextResponse.json({ ok: results.every((r) => r.status !== "failed"), results });
}
