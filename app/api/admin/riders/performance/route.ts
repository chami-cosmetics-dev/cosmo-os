import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { incentiveForOrder, loadRiderDeliveryChargeMap } from "@/lib/rider-incentive-resolve";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { aggregateRiderIncentives } from "@/lib/rider-incentive";
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

  const riders = aggregateRiderIncentives(
    tasks.map((task) => ({
      riderId: task.riderId,
      riderName: task.rider.name,
      knownName: task.rider.knownName,
      incentiveAmount: incentiveForOrder(task.order, chargeByLabelKey),
      financialStatus: task.order.financialStatus,
    }))
  );

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    riders,
  });
}
