import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAllowedCompanyErpPaymentMode } from "@/lib/erp-payment-modes";
import { markOrderInvoiceComplete } from "@/lib/mark-order-invoice-complete";
import { buildHandoverOrders, loadRiderHandoverDeliveries } from "@/lib/rider-handover";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, trimmedString } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ELIGIBLE_CAP = 80;

const bodySchema = z.object({
  riderId: cuidSchema,
  from: z.string(),
  to: z.string(),
  modes: z
    .array(
      z.object({
        orderId: cuidSchema,
        modeOfPayment: trimmedString(1, 200),
      }),
    )
    .max(200)
    .optional(),
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

  const orders = await buildHandoverOrders(loaded.deliveries);
  const eligible = orders.filter((order) => order.eligible);
  if (eligible.length > ELIGIBLE_CAP) {
    return NextResponse.json(
      { error: "Too many orders for one close. Shorten the date range." },
      { status: 400 },
    );
  }

  const overrideByOrder = new Map(
    (parsed.data.modes ?? []).map((mode) => [mode.orderId, mode.modeOfPayment.trim()]),
  );
  const eligibleIds = new Set(eligible.map((order) => order.orderId));

  const results: Array<{
    orderId: string;
    ref: string;
    success: boolean;
    error?: string;
    peStatus?: "created" | "already_paid";
  }> = [];

  for (const order of eligible) {
    const override = overrideByOrder.get(order.orderId);
    let modeOfPayment: string | null = null;
    if (override && eligibleIds.has(order.orderId)) {
      if (!isAllowedCompanyErpPaymentMode(order.modes, override)) {
        results.push({
          orderId: order.orderId,
          ref: order.ref,
          success: false,
          error: "Invalid ERP payment mode",
        });
        continue;
      }
      modeOfPayment = override;
    } else if (order.selectedMop) {
      modeOfPayment = order.selectedMop;
    } else {
      results.push({
        orderId: order.orderId,
        ref: order.ref,
        success: false,
        error: "Select a payment type",
      });
      continue;
    }

    const outcome = await markOrderInvoiceComplete({
      companyId,
      orderId: order.orderId,
      userId,
      modeOfPayment,
      bulk: true,
      commitOnlyWhenPaymentEntrySucceeds: true,
    });
    if (!outcome.success) {
      results.push({
        orderId: order.orderId,
        ref: outcome.ref,
        success: false,
        error: outcome.error,
      });
      continue;
    }
    results.push({
      orderId: order.orderId,
      ref: outcome.ref,
      success: true,
      ...(outcome.peStatus ? { peStatus: outcome.peStatus } : {}),
    });
  }

  return NextResponse.json({ results });
}
