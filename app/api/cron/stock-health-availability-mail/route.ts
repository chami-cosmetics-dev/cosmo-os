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
 * Mail 2 — Stock Availability Status (Overall + Company Wise). Mondays 9:00 AM Asia/Colombo
 * (vercel.json "30 3 * * 1", UTC). Once per Monday.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await sendScheduledStockHealthMailForAllCompanies("rop");
  return NextResponse.json({ ok: results.every((r) => r.status !== "failed"), results });
}
