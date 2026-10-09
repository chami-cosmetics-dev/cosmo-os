import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { loadRiderIncentiveStatement } from "@/lib/rider-incentive-statement-load";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({
  from: ymdSchema.or(z.string().datetime({ offset: true })).or(z.string().min(10).max(40)),
  to: ymdSchema.or(z.string().datetime({ offset: true })).or(z.string().min(10).max(40)),
  riderId: cuidSchema,
});

function resolveRangeBound(raw: string, kind: "start" | "end"): Date | null {
  const asYmd = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : formatAppIsoDate(raw, "");
  if (!asYmd) return null;
  return kind === "start" ? parseAppCalendarDayStart(asYmd) : parseAppCalendarDayEnd(asYmd);
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("riders.incentive.export");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = querySchema.safeParse({
    from: request.nextUrl.searchParams.get("from") ?? "",
    to: request.nextUrl.searchParams.get("to") ?? "",
    riderId: request.nextUrl.searchParams.get("riderId") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rider or date range" }, { status: 400 });
  }

  const from = resolveRangeBound(parsed.data.from, "start");
  const to = resolveRangeBound(parsed.data.to, "end");
  if (!from || !to || to < from) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const statement = await loadRiderIncentiveStatement({
    companyId,
    riderId: parsed.data.riderId,
    from,
    to,
  });

  return NextResponse.json({
    from: parsed.data.from,
    to: parsed.data.to,
    ...statement,
  });
}
