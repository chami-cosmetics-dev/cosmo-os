import { NextRequest, NextResponse } from "next/server";

import { checkStaffRequestsForRestock } from "@/lib/wishlist-buddy/requests";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Safety net for the ERP stock webhook: re-checks staff stock requests that are waiting for stock
 * and marks them restocked (reminder bubble + customer email) when any warehouse has it.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await checkStaffRequestsForRestock({ limit: 300 });
  return NextResponse.json(result);
}
