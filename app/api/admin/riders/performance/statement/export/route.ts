import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { loadRiderIncentiveStatement } from "@/lib/rider-incentive-statement-load";
import {
  incentiveExportBlockReason,
  incentiveStatementCsv,
} from "@/lib/rider-incentive-statement";
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

function fileSlug(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "rider";
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
  const block = incentiveExportBlockReason(statement.unmatchedCount);
  if (block) {
    return NextResponse.json(
      { error: block, unmatchedCount: statement.unmatchedCount },
      { status: 409 },
    );
  }

  const fromYmd = formatAppIsoDate(from);
  const toYmd = formatAppIsoDate(to);
  const csv = incentiveStatementCsv({
    riderName: statement.riderName,
    companies: statement.companies,
    shippingTotal: statement.shippingTotal,
    riderPaymentTotal: statement.riderPaymentTotal,
  });
  const fileName = `rider-incentive-${fileSlug(statement.riderName)}-${fromYmd}-to-${toYmd}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
