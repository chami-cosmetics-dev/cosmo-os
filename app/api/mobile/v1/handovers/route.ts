import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireRiderMobileSession, mobileError } from "@/lib/mobile/api";
import { startOfDay } from "@/lib/mobile/dates";
import { toMobileHandoverDto } from "@/lib/mobile/dto";
import { getRiderCashSummary } from "@/lib/mobile/reconciliation";
import { riderCashHandoverCreateSchema } from "@/lib/mobile/validation";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireRiderMobileSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const handovers = await prisma.riderCashHandover.findMany({
    where: { riderId: auth.session.userId },
    include: {
      items: {
        include: {
          companyLocation: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: [{ handoverDate: "desc" }, { createdAt: "desc" }],
    take: 20,
  });

  return NextResponse.json({
    handovers: handovers.map((handover) =>
      toMobileHandoverDto({ handover, items: handover.items })
    ),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRiderMobileSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = riderCashHandoverCreateSchema.safeParse(body);
  if (!parsed.success) {
    return mobileError("Invalid handover payload", 400);
  }

  if (parsed.data.idempotencyKey) {
    const existing = await prisma.riderCashHandover.findFirst({
      where: { idempotencyKey: parsed.data.idempotencyKey },
    });
    if (existing) {
      return NextResponse.json({ success: true, handoverId: existing.id, deduplicated: true });
    }
  }

  const handoverDate = parsed.data.handoverDate
    ? startOfDay(new Date(parsed.data.handoverDate))
    : startOfDay(new Date());

  const summary = await getRiderCashSummary(auth.session.userId, handoverDate);
  const totalHandedOverCash = new Prisma.Decimal(parsed.data.totalHandedOverCash.toFixed(2));
  const varianceAmount = totalHandedOverCash.sub(summary.totalCollectedCash);

  const handover = await prisma.riderCashHandover.create({
    data: {
      riderId: auth.session.userId,
      handoverDate,
      totalExpectedCash: summary.totalCollectedCash,
      totalHandedOverCash,
      varianceAmount,
      notes: parsed.data.notes?.trim() || null,
      idempotencyKey: parsed.data.idempotencyKey,
      items: {
        create: summary.groups.map((group) => ({
          companyLocationId: group.companyLocationId,
          cashAmount: group.cashAmount,
          orderCount: group.orderCount,
        })),
      },
    },
    include: {
      items: {
        include: {
          companyLocation: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  await prisma.deliveryPayment.updateMany({
    where: {
      id: { in: summary.payments.map((payment) => payment.id) },
      cashHandoverId: null,
    },
    data: {
      cashHandoverId: handover.id,
    },
  });

  return NextResponse.json({
    success: true,
    handover: {
      id: handover.id,
      handoverDate: handover.handoverDate.toISOString(),
      totalExpectedCash: handover.totalExpectedCash.toString(),
      totalHandedOverCash: handover.totalHandedOverCash.toString(),
      varianceAmount: handover.varianceAmount.toString(),
      status: handover.status,
      items: handover.items.map((item) => ({
        id: item.id,
        companyLocationId: item.companyLocationId,
        companyLocationName: item.companyLocation.name,
        cashAmount: item.cashAmount.toString(),
        orderCount: item.orderCount,
      })),
    },
  });
}
