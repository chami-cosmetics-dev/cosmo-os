import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  isAllowedCompanyErpPaymentMode,
  listCompanyErpPaymentModes,
} from "@/lib/erp-payment-modes";
import { markOrderInvoiceComplete } from "@/lib/mark-order-invoice-complete";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, trimmedString } from "@/lib/validation";

const schema = z.object({
  orderIds: z.array(cuidSchema).min(1).max(50),
  modeOfPayment: trimmedString(1, 200),
});

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function getCompanyId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("fulfillment.delivery_invoice.mark_complete");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const paymentModes = await listCompanyErpPaymentModes(companyId);
  if (!isAllowedCompanyErpPaymentMode(paymentModes, parsed.data.modeOfPayment)) {
    return NextResponse.json({ error: "Invalid ERP payment mode" }, { status: 400 });
  }

  const userId = auth.context!.user!.id;
  const results: Array<{
    orderId: string;
    ref: string;
    success: boolean;
    error?: string;
    erpPeError?: string;
  }> = [];

  for (const orderId of parsed.data.orderIds) {
    try {
      const outcome = await markOrderInvoiceComplete({
        companyId,
        orderId,
        userId,
        modeOfPayment: parsed.data.modeOfPayment,
        bulk: true,
      });
      if (outcome.success) {
        results.push({
          orderId,
          ref: outcome.ref,
          success: true,
          ...(outcome.erpPeError ? { erpPeError: outcome.erpPeError } : {}),
        });
      } else {
        results.push({
          orderId,
          ref: outcome.ref,
          success: false,
          error: outcome.error,
        });
      }
    } catch (err) {
      console.error("[bulk-invoice-complete] error for orderId", orderId, err);
      results.push({
        orderId,
        ref: orderId,
        success: false,
        error: "Internal error",
      });
    }
  }

  return NextResponse.json({ results });
}
