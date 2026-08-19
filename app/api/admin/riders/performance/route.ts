import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { incentiveMatchForOrder, loadRiderDeliveryChargeMap } from "@/lib/rider-incentive-resolve";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { aggregateRiderIncentives, isIncentiveEligibleOrder } from "@/lib/rider-incentive";
import { cuidSchema } from "@/lib/validation";

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({
  // Prefer YYYY-MM-DD (Asia/Colombo calendar day). ISO datetimes still accepted for older clients.
  from: ymdSchema.or(z.string().datetime({ offset: true })).or(z.string().min(10).max(40)),
  to: ymdSchema.or(z.string().datetime({ offset: true })).or(z.string().min(10).max(40)),
  riderId: cuidSchema.optional(),
});

function resolveRangeBound(raw: string, kind: "start" | "end"): Date | null {
  const asYmd = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : formatAppIsoDate(raw, "");
  if (!asYmd) return null;
  return kind === "start" ? parseAppCalendarDayStart(asYmd) : parseAppCalendarDayEnd(asYmd);
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("staff.read");
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
    riderId: request.nextUrl.searchParams.get("riderId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const from = resolveRangeBound(parsed.data.from, "start");
  const to = resolveRangeBound(parsed.data.to, "end");
  if (!from || !to || to < from) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const [tasks, chargeByLabelKey] = await Promise.all([
    prisma.riderDeliveryTask.findMany({
      where: {
        status: "completed",
        completedAt: { gte: from, lte: to },
        ...(parsed.data.riderId ? { riderId: parsed.data.riderId } : {}),
        order: { companyId },
      },
      select: {
        riderId: true,
        completedAt: true,
        rider: { select: { name: true, knownName: true } },
        order: {
          select: {
            totalShipping: true,
            shippingLines: true,
            rawPayload: true,
            sourceName: true,
            discountCodes: true,
            financialStatus: true,
          },
        },
      },
    }),
    loadRiderDeliveryChargeMap(),
  ]);

  const rowInputs = tasks.map((task) => {
    const match = incentiveMatchForOrder(task.order, chargeByLabelKey);
    return {
      riderId: task.riderId,
      riderName: task.rider.name,
      knownName: task.rider.knownName,
      incentiveAmount: match.amount,
      matched: match.matched,
      financialStatus: task.order.financialStatus,
      completedAt: task.completedAt,
    };
  });

  const riders = aggregateRiderIncentives(rowInputs);

  let totalIncentive = new Prisma.Decimal(0);
  let unmatchedTotal = 0;
  for (const row of rowInputs) {
    if (!isIncentiveEligibleOrder(row.financialStatus)) continue;
    totalIncentive = totalIncentive.add(row.incentiveAmount);
    if (!row.matched) unmatchedTotal += 1;
  }

  const dailyMap = new Map<string, { completedCount: number; incentiveTotal: Prisma.Decimal }>();
  for (const row of rowInputs) {
    if (!isIncentiveEligibleOrder(row.financialStatus)) continue;
    if (!row.completedAt) continue;
    const date = formatAppIsoDate(row.completedAt);
    if (!date) continue;
    const bucket =
      dailyMap.get(date) ??
      { completedCount: 0, incentiveTotal: new Prisma.Decimal(0) };
    bucket.completedCount += 1;
    bucket.incentiveTotal = bucket.incentiveTotal.add(row.incentiveAmount);
    dailyMap.set(date, bucket);
  }

  const dailySeries = Array.from(dailyMap.entries())
    .map(([date, bucket]) => ({
      date,
      completedCount: bucket.completedCount,
      incentiveTotal: bucket.incentiveTotal.toFixed(2),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    summary: {
      totalCompletions: riders.reduce((sum, r) => sum + r.completedCount, 0),
      totalIncentive: totalIncentive.toFixed(2),
      ridersWithCompletions: riders.length,
      unmatchedTotal,
    },
    dailySeries,
    riders,
  });
}
