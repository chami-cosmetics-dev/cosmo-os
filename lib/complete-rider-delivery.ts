import type { FulfillmentStage, OldItemCollectionStatus, Prisma } from "@prisma/client";

import { applyPostDeliveryInvoiceAndPayment } from "@/lib/delivery-payment-approval";
import { orderStageUpdate } from "@/lib/order-stage-timing";
import { prisma } from "@/lib/prisma";

export function isRiderDeliveryAlreadyCompletedStage(stage: FulfillmentStage | string): boolean {
  return stage === "delivery_complete" || stage === "invoice_complete";
}

async function applyPostDeliverySafe(input: {
  companyId: string;
  orderId: string;
  requestedById: string | null;
}) {
  try {
    await applyPostDeliveryInvoiceAndPayment(input);
  } catch (err) {
    console.error("[Delivery] post-delivery invoice/payment failed:", err);
  }
}

export type CompleteRiderDeliveryResult =
  | { success: true; alreadyCompleted: true }
  | {
      success: true;
      alreadyCompleted: false;
      orderId: string;
      companyId: string;
      riderId: string | null;
      hadTask: boolean;
      order: Prisma.OrderGetPayload<{ include: { companyLocation: true } }>;
    }
  | { success: false; error: string; status: number };

type Tx = Prisma.TransactionClient;

async function completeOrderAndOptionalTask(
  tx: Tx,
  input: {
    orderId: string;
    now: Date;
    deliveryCompleteById: string | null;
    taskId?: string;
    taskExtras?: {
      acceptedAt?: Date | null;
      arrivedAt?: Date | null;
      oldItemCollectionStatus?: OldItemCollectionStatus;
      oldItemCollectionRemark?: string | null;
    };
  },
) {
  if (input.taskId) {
    await tx.riderDeliveryTask.update({
      where: { id: input.taskId },
      data: {
        status: "completed",
        completedAt: input.now,
        failedAt: null,
        failureReason: null,
        latestSyncAt: input.now,
        ...(input.taskExtras?.acceptedAt != null
          ? { acceptedAt: input.taskExtras.acceptedAt }
          : {}),
        ...(input.taskExtras?.arrivedAt != null
          ? { arrivedAt: input.taskExtras.arrivedAt }
          : {}),
        ...(input.taskExtras?.oldItemCollectionStatus != null
          ? {
              oldItemCollectionStatus: input.taskExtras.oldItemCollectionStatus,
              oldItemCollectionRemark: input.taskExtras.oldItemCollectionRemark ?? null,
            }
          : {}),
      },
    });
  }

  return tx.order.update({
    where: { id: input.orderId },
    data: {
      ...orderStageUpdate("delivery_complete", input.now),
      deliveryCompleteAt: input.now,
      deliveryCompleteById: input.deliveryCompleteById,
      deliveryOutcome: "delivered",
      deliveryFailedReason: null,
      lastRiderUpdateAt: input.now,
      riderDeliveryToken: null,
    },
    include: { companyLocation: true },
  });
}

/**
 * Complete delivery via public link token.
 * - With rider task: complete task + order; attribute deliveryCompleteById to task.riderId
 * - Without task: order delivery-complete only (no rider performance credit)
 */
export async function completeRiderDeliveryByToken(input: {
  token: string;
  now?: Date;
}): Promise<CompleteRiderDeliveryResult> {
  const now = input.now ?? new Date();
  const order = await prisma.order.findFirst({
    where: { riderDeliveryToken: input.token },
    select: {
      id: true,
      companyId: true,
      fulfillmentStage: true,
      riderDeliveryTask: { select: { id: true, riderId: true } },
    },
  });

  if (!order) {
    return { success: false, error: "Invalid or expired link", status: 404 };
  }

  if (isRiderDeliveryAlreadyCompletedStage(order.fulfillmentStage)) {
    if (order.fulfillmentStage === "delivery_complete") {
      await applyPostDeliverySafe({
        companyId: order.companyId,
        orderId: order.id,
        requestedById: order.riderDeliveryTask?.riderId ?? null,
      });
    }
    return { success: true, alreadyCompleted: true };
  }

  const task = order.riderDeliveryTask;
  const updated = await prisma.$transaction((tx) =>
    completeOrderAndOptionalTask(tx, {
      orderId: order.id,
      now,
      deliveryCompleteById: task?.riderId ?? null,
      taskId: task?.id,
    }),
  );

  await applyPostDeliverySafe({
    companyId: order.companyId,
    orderId: order.id,
    requestedById: task?.riderId ?? null,
  });

  return {
    success: true,
    alreadyCompleted: false,
    orderId: order.id,
    companyId: order.companyId,
    riderId: task?.riderId ?? null,
    hadTask: Boolean(task),
    order: updated,
  };
}

/**
 * Complete an existing rider delivery task (mobile / authenticated rider).
 */
export async function completeRiderDeliveryTask(input: {
  taskId: string;
  riderId: string;
  now?: Date;
  acceptedAt?: Date | null;
  arrivedAt?: Date | null;
  oldItemCollectionStatus?: OldItemCollectionStatus;
  oldItemCollectionRemark?: string | null;
}): Promise<CompleteRiderDeliveryResult> {
  const now = input.now ?? new Date();
  const task = await prisma.riderDeliveryTask.findFirst({
    where: { id: input.taskId, riderId: input.riderId },
    select: {
      id: true,
      riderId: true,
      orderId: true,
      order: { select: { companyId: true, fulfillmentStage: true } },
    },
  });

  if (!task) {
    return { success: false, error: "Delivery not found", status: 404 };
  }

  if (isRiderDeliveryAlreadyCompletedStage(task.order.fulfillmentStage)) {
    if (task.order.fulfillmentStage === "delivery_complete") {
      await applyPostDeliverySafe({
        companyId: task.order.companyId,
        orderId: task.orderId,
        requestedById: input.riderId,
      });
    }
    return { success: true, alreadyCompleted: true };
  }

  const updated = await prisma.$transaction((tx) =>
    completeOrderAndOptionalTask(tx, {
      orderId: task.orderId,
      now,
      deliveryCompleteById: input.riderId,
      taskId: task.id,
      taskExtras: {
        acceptedAt: input.acceptedAt,
        arrivedAt: input.arrivedAt,
        oldItemCollectionStatus: input.oldItemCollectionStatus,
        oldItemCollectionRemark: input.oldItemCollectionRemark,
      },
    }),
  );

  await applyPostDeliverySafe({
    companyId: task.order.companyId,
    orderId: task.orderId,
    requestedById: input.riderId,
  });

  return {
    success: true,
    alreadyCompleted: false,
    orderId: task.orderId,
    companyId: task.order.companyId,
    riderId: task.riderId,
    hadTask: true,
    order: updated,
  };
}
