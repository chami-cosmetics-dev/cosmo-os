import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  isAllowedCompanyErpPaymentMode,
  listCompanyErpPaymentModes,
} from "@/lib/erp-payment-modes";
import { markOrderErpPeSyncFailed, retryOrderErpPeSync } from "@/lib/failed-erp-pe-sync";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, trimmedString } from "@/lib/validation";

const bodySchema = z.object({
  modeOfPayment: trimmedString(1, 200).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("failed_webhooks.retry");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    select: { id: true, erpPeSyncError: true, erpPeSyncMop: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!order.erpPeSyncError) {
    return NextResponse.json({ error: "No failed ERP payment entry on this order" }, { status: 400 });
  }

  const mopName = parsed.data.modeOfPayment?.trim() || order.erpPeSyncMop?.trim() || "";
  if (!mopName) {
    return NextResponse.json({ error: "ERP payment mode is required" }, { status: 400 });
  }

  const paymentModes = await listCompanyErpPaymentModes(companyId);
  if (!isAllowedCompanyErpPaymentMode(paymentModes, mopName)) {
    return NextResponse.json({ error: "Invalid ERP payment mode" }, { status: 400 });
  }

  try {
    await retryOrderErpPeSync({
      orderId: order.id,
      companyId,
      mopName,
    });
    return NextResponse.json({ ok: true, message: "ERP payment entry created" });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await markOrderErpPeSyncFailed(order.id, errMsg, mopName);
    return NextResponse.json({ error: "Retry failed", details: errMsg }, { status: 500 });
  }
}
