import { NextRequest, NextResponse } from "next/server";

import {
  captureErpStockSnapshot,
  listSnapshotDates,
  latestStockSnapshotMeta,
} from "@/lib/item-trends/stock-snapshot";
import { yesterdaySnapshotDate } from "@/lib/item-trends/snapshot-date";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const maxDuration = 300;

export async function GET() {
  const auth = await requirePermission("purchasing.item_trends.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  const dates = await listSnapshotDates(companyId);
  const yesterday = yesterdaySnapshotDate();
  const latest = dates[0] ?? (await latestStockSnapshotMeta(companyId));
  const defaultDate = dates.some((d) => d.snapshotDate === yesterday)
    ? yesterday
    : (latest?.snapshotDate ?? null);
  return NextResponse.json({
    defaultDate,
    latestDate: latest?.snapshotDate ?? null,
    dates: dates.map((d) => ({
      snapshotDate: d.snapshotDate,
      capturedAt: d.capturedAt.toISOString(),
    })),
  });
}

export async function POST(_request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  try {
    const result = await captureErpStockSnapshot(companyId);
    return NextResponse.json({
      snapshotDate: result.snapshotDate,
      capturedAt: result.capturedAt.toISOString(),
      rowCount: result.rowCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to capture stock snapshot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
