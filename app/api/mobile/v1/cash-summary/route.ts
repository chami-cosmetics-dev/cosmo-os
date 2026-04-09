import { NextRequest, NextResponse } from "next/server";

import { requireRiderMobileSession } from "@/lib/mobile/api";
import { getRiderCashSummary } from "@/lib/mobile/reconciliation";

export async function GET(request: NextRequest) {
  const auth = await requireRiderMobileSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const summary = await getRiderCashSummary(auth.session.userId);

  return NextResponse.json({
    date: summary.date.toISOString(),
    totalExpectedCash: summary.totalExpectedCash.toString(),
    totalCollectedCash: summary.totalCollectedCash.toString(),
    groups: summary.groups.map((group) => ({
      companyLocationId: group.companyLocationId,
      companyLocationName: group.companyLocationName,
      cashAmount: group.cashAmount.toString(),
      orderCount: group.orderCount,
    })),
    orders: summary.payments.map((payment) => ({
      paymentId: payment.id,
      orderId: payment.orderId,
      orderLabel:
        payment.order.name ?? payment.order.orderNumber ?? payment.order.shopifyOrderId,
      companyLocationId: payment.order.companyLocationId,
      companyLocationName: payment.order.companyLocation.name,
      expectedAmount: payment.expectedAmount.toString(),
      collectedAmount: payment.collectedAmount.toString(),
      collectionStatus: payment.collectionStatus,
      collectedAt: payment.collectedAt?.toISOString() ?? null,
    })),
  });
}
