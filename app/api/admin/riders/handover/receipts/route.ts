import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  groupCashByErpCompany,
  handoverPeriodDates,
  latestHandoverReceipt,
  loadRiderHandoverDeliveries,
  receiptDuplicateDecision,
  toStoredReceiptView,
} from "@/lib/rider-handover";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  riderId: cuidSchema,
  from: z.string(),
  to: z.string(),
  confirmDuplicate: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requirePermission("riders.handover.receive");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user?.companyId;
  const userId = auth.context!.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const loaded = await loadRiderHandoverDeliveries({
    companyId,
    riderId: parsed.data.riderId,
    fromYmd: parsed.data.from,
    toYmd: parsed.data.to,
  });
  if (!loaded.ok) {
    if (loaded.error === "rider_not_found") {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const existing = await latestHandoverReceipt({
    companyId,
    riderId: loaded.riderId,
    fromYmd: parsed.data.from,
    toYmd: parsed.data.to,
  });
  const decision = receiptDuplicateDecision({
    existing,
    confirmDuplicate: parsed.data.confirmDuplicate === true,
  });
  if (decision.action === "reject") {
    return NextResponse.json(
      {
        error: "Cash was already marked received for this rider and period",
        latestReceipt: decision.existing,
      },
      { status: 409 },
    );
  }

  const grouped = groupCashByErpCompany(
    loaded.deliveries.map((delivery) => ({
      erpnextCompany: delivery.erpnextCompany,
      locationName: delivery.locationName,
      payment: delivery.payment,
    })),
  );
  const dates = handoverPeriodDates(parsed.data.from, parsed.data.to);
  const receipt = await prisma.riderFinanceCashReceipt.create({
    data: {
      companyId,
      riderId: loaded.riderId,
      periodFrom: dates.periodFrom,
      periodTo: dates.periodTo,
      receivedById: userId,
      companyTotals: grouped.companies as Prisma.InputJsonValue,
      fullTotal: grouped.fullTotal,
    },
    include: { receivedBy: { select: { name: true, knownName: true } } },
  });

  return NextResponse.json(
    {
      ...toStoredReceiptView(receipt),
      riderId: loaded.riderId,
      from: parsed.data.from,
      to: parsed.data.to,
    },
    { status: 201 },
  );
}
