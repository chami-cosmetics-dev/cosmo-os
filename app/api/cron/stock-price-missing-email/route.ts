import { NextRequest, NextResponse } from "next/server";

import { runStockPriceMissingDailyEmail } from "@/lib/stock-price-missing/email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/** Daily 16:00 Asia/Colombo — stock in both ERPs, Standard/OGF price missing. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preview = request.nextUrl.searchParams.get("preview") === "1";
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim() || undefined;

  const result = await runStockPriceMissingDailyEmail({ companyId, preview });

  return NextResponse.json({
    ok: result.status === "sent" || result.status === "preview",
    ...result,
  });
}
