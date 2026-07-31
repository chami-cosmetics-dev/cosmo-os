import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { endOfDay, startOfDay } from "@/lib/mobile/dates";
import { incentiveForOrder, loadRiderDeliveryChargeMap } from "@/lib/rider-incentive-resolve";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { aggregateRiderIncentives } from "@/lib/rider-incentive";
import { cuidSchema } from "@/lib/validation";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).or(z.string().min(10).max(40)),
  to: z.string().datetime({ offset: true }).or(z.string().min(10).max(40)),
  riderId: cuidSchema.optional(),
});

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

  const from = startOfDay(new Date(parsed.data.from));
  const to = endOfDay(new Date(parsed.data.to));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
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
