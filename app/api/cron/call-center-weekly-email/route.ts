import { NextRequest, NextResponse } from "next/server";

import {
  getPreviousColomboReportDate,
  isValidReportDate,
  runCallCenterWeeklyEmail,
} from "@/lib/call-center-weekly-email";

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
  const asOfYmd =
    dateParam && isValidReportDate(dateParam)
      ? dateParam
      : getPreviousColomboReportDate();

  const result = await runCallCenterWeeklyEmail({
    asOfYmd,
    source: "cron",
  });

  return NextResponse.json({
    ok: result.status === "sent",
    ...result,
  });
}
