import { NextRequest, NextResponse } from "next/server";

import { requireRiderMobileSession, mobileError } from "@/lib/mobile/api";
import { toMobileDeliveryDto } from "@/lib/mobile/dto";
import { findRiderTaskById } from "@/lib/mobile/orders";
import { resolveMobileSpecialDelivery } from "@/lib/mobile/special-delivery";
import { mobileRouteIdSchema } from "@/lib/mobile/validation";
import { incentiveForOrder, loadRiderDeliveryChargeMap } from "@/lib/rider-incentive-resolve";

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

  const [task, chargeByLabelKey] = await Promise.all([
    findRiderTaskById(idResult.data, auth.session.userId),
    loadRiderDeliveryChargeMap(),
  ]);
  if (!task) {
    return mobileError("Delivery not found", 404);
  }

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
        incentiveAmount: incentiveForOrder(task.order, chargeByLabelKey).toFixed(2),
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
