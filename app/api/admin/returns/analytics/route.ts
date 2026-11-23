import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  currentReturnsYearMonth,
  fetchReturnsReasonAnalytics,
  isReturnsYearMonth,
} from "@/lib/page-data/order-returns";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const monthQuerySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM");

export async function GET(request: NextRequest) {
  const auth = await requirePermission("returns.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const rawMonth = request.nextUrl.searchParams.get("month")?.trim() ?? currentReturnsYearMonth();
  const parsed = monthQuerySchema.safeParse(rawMonth);
  if (!parsed.success || !isReturnsYearMonth(parsed.data)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const analytics = await fetchReturnsReasonAnalytics({
    companyId,
    yearMonth: parsed.data,
  });

  return NextResponse.json(analytics);
}
