import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { loadAllRiderIncentiveStatements } from "@/lib/rider-incentive-statement-load";
import { incentiveExportBlockReason } from "@/lib/rider-incentive-statement";
import { buildAllRidersIncentiveWorkbook } from "@/lib/rider-incentive-workbook";
import { requirePermission } from "@/lib/rbac";

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({
  from: ymdSchema.or(z.string().datetime({ offset: true })).or(z.string().min(10).max(40)),
  to: ymdSchema.or(z.string().datetime({ offset: true })).or(z.string().min(10).max(40)),
});

function resolveRangeBound(raw: string, kind: "start" | "end"): Date | null {
  const asYmd = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : formatAppIsoDate(raw, "");
  if (!asYmd) return null;
  return kind === "start" ? parseAppCalendarDayStart(asYmd) : parseAppCalendarDayEnd(asYmd);
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const from = resolveRangeBound(parsed.data.from, "start");
  const to = resolveRangeBound(parsed.data.to, "end");
  if (!from || !to || to < from) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const statements = await loadAllRiderIncentiveStatements({ companyId, from, to });
  const unmatchedCount = statements.reduce((sum, statement) => sum + statement.unmatchedCount, 0);
  const block = incentiveExportBlockReason(unmatchedCount);
  if (block) {
    return NextResponse.json({ error: block, unmatchedCount }, { status: 409 });
  }

  const fromYmd = formatAppIsoDate(from);
  const toYmd = formatAppIsoDate(to);
  const buffer = buildAllRidersIncentiveWorkbook(statements);
  const fileName = `rider-pay-all-${fromYmd}-to-${toYmd}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
