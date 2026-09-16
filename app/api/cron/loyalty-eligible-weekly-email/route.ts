import { NextRequest, NextResponse } from "next/server";

import { runLoyaltyEligibleWeeklyEmail } from "@/lib/loyalty-eligible-weekly-email";
import { isValidReportDate } from "@/lib/call-center-weekly-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date")?.trim();
  const preview = request.nextUrl.searchParams.get("preview") === "1";
  const asOfYmd =
    dateParam && isValidReportDate(dateParam) ? dateParam : undefined;

  const result = await runLoyaltyEligibleWeeklyEmail({
    asOfYmd,
    preview,
  });

  return NextResponse.json({
    ok: result.status === "sent" || result.status === "preview",
    ...result,
  });
}
