import { NextRequest, NextResponse } from "next/server";

import { requireRiderMobileSession, mobileError } from "@/lib/mobile/api";
import { toMobileDeliveryDto } from "@/lib/mobile/dto";
import { findRiderTaskById } from "@/lib/mobile/orders";
import { resolveMobileSpecialDelivery } from "@/lib/mobile/special-delivery";
import { mobileRouteIdSchema } from "@/lib/mobile/validation";
import { incentiveForOrder, loadRiderIncentiveContext } from "@/lib/rider-incentive-resolve";
import { loadLatestOrderSplitPaymentLines } from "@/lib/order-split-payment";
import { approvalSplitCashCollectAmount } from "@/lib/approval-payment-split";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRiderMobileSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const idResult = mobileRouteIdSchema.safeParse(id);
  if (!idResult.success) {
    return mobileError("Invalid delivery ID", 400);
  }

  const [task, incentiveContext] = await Promise.all([
    findRiderTaskById(idResult.data, auth.session.userId),
    loadRiderIncentiveContext(),
  ]);
  if (!task) {
    return mobileError("Delivery not found", 404);
  }

  const collectCashAmount = approvalSplitCashCollectAmount(
    await loadLatestOrderSplitPaymentLines(task.order.id),
  );

  return NextResponse.json({
    delivery: {
      ...toMobileDeliveryDto({
        order: task.order,
        task,
        payment: task.order.deliveryPayment,
        companyLocation: task.order.companyLocation,
        specialDelivery: resolveMobileSpecialDelivery({
          order: task.order,
          task,
        }),
        incentiveAmount: incentiveForOrder(
          task.order,
          incentiveContext.chargeByLabelKey,
          incentiveContext.zoneMembersByZone,
          task.manualIncentiveLabelKey
        ).toFixed(2),
        collectCashAmount,
      }),
      lineItems: task.order.lineItems.map((item) => ({
        id: item.id,
        productTitle: item.productItem.productTitle,
        variantTitle: item.productItem.variantTitle,
        sku: item.productItem.sku,
        quantity: item.quantity,
        price: item.price.toString(),
      })),
    },
  });
}
