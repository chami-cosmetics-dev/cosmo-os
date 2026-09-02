import { NextRequest, NextResponse } from "next/server";

import { resolveItemTrendWindows } from "@/lib/item-trends/aggregate";
import { computeRopSuggestions } from "@/lib/item-trends/rop-suggest";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { itemTrendsRopQuerySchema } from "@/lib/validation";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.item_trends.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = itemTrendsRopQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const movementFrom = data.from ?? formatDefaultFrom();
  const movementTo = data.to ?? formatDefaultTo();

  try {
    const { current, prior } = resolveItemTrendWindows({
      fromYmd: movementFrom,
      toYmd: movementTo,
    });

    const result = await computeRopSuggestions({
      companyId,
      ropWindow: data.ropWindow,
      ropFrom: data.ropFrom,
      ropTo: data.ropTo,
      movementRange: current,
      priorRange: prior,
      priority: data.priority,
      offset: data.offset,
      limit: data.limit,
    });

    return NextResponse.json({
      windowLabel: result.windowLabel,
      rows: result.rows,
      total: result.total,
      offset: data.offset,
      limit: data.limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load ROP suggestions";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function formatDefaultTo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDefaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
