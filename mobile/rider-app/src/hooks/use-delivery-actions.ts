import { Alert } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useState } from "react";
import { apiClient } from "@/src/api/client";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import { queueAction } from "@/src/storage/offline-queue";
import type { MobileDeliveryDetail, OldItemCollectionStatus, PaymentMethod } from "@/src/types";

function requiresReference(method: PaymentMethod) {
  return method === "bank_transfer" || method === "card";
}

function amountsMatch(expected: string, actual: number) {
  return Math.abs(Number(expected) - actual) < 0.01;
}

async function submitOrQueue(params: {
  endpoint: string;
  body: Record<string, unknown>;
  queuedMessage: string;
}) {
  const net = await NetInfo.fetch();
  const isOnline = !!net.isConnected && !!net.isInternetReachable;

  if (isOnline) {
    try {
      await apiClient.post(params.endpoint, params.body);
      return { mode: "live" as const };
    } catch {
      // Fall back to offline queue when the live request fails.
    }
  }

  await queueAction({
    endpoint: params.endpoint,
    method: "POST",
    body: params.body,
  });
  return { mode: "queued" as const, message: params.queuedMessage };
}

type DeliveryActionInput = {
  deliveryId: string;
  delivery: MobileDeliveryDetail;
  collectedAmount: string;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  paymentNote: string;
  oldItemCollectionStatus: OldItemCollectionStatus;
  oldItemCollectionRemark: string;
};

export function useDeliveryActions() {
  const router = useRouter();
  const { markCompleted } = useCompletedDeliveries();
  const [submitting, setSubmitting] = useState(false);

  async function markDelivered(input: DeliveryActionInput) {
    const {
      deliveryId,
      delivery,
      collectedAmount,
      paymentMethod,
      paymentReference,
      paymentNote,
      oldItemCollectionStatus,
      oldItemCollectionRemark,
    } = input;

    const numericAmount = Number(collectedAmount || 0);
    const expectedAmount = Number(delivery.amount);
    const effectiveCollectedAmount =
      paymentMethod === "already_paid" && numericAmount <= 0 ? expectedAmount : numericAmount;
    const needsOldItemCollection = delivery.requiresOldItemCollection;

    if (paymentMethod === "cod" && numericAmount <= 0) {
      Alert.alert("Missing amount", "Enter the amount collected from the customer.");
      return;
    }

    if (!amountsMatch(delivery.amount, effectiveCollectedAmount)) {
      Alert.alert("Amount mismatch", "Collected amount must match the order amount before completing.");
      return;
    }

    if (needsOldItemCollection && oldItemCollectionStatus === "pending") {
      Alert.alert("Old order collection", "Confirm whether the old order was collected.");
      return;
    }

    if (
      needsOldItemCollection &&
      oldItemCollectionStatus === "not_collected" &&
      !oldItemCollectionRemark.trim()
    ) {
      Alert.alert("Remark required", "Enter a remark if the customer did not hand over the old order.");
      return;
    }

    if (requiresReference(paymentMethod) && !paymentReference.trim()) {
      Alert.alert("Missing reference", "Enter the payment reference before submitting.");
      return;
    }

    setSubmitting(true);

    try {
      const paymentResult = await submitOrQueue({
        endpoint: `/api/mobile/v1/deliveries/${deliveryId}/payment`,
        body: {
          paymentMethod,
          collectedAmount:
            paymentMethod === "already_paid" && numericAmount <= 0 ? Number(delivery.amount) : numericAmount,
          bankReference: paymentMethod === "bank_transfer" ? paymentReference.trim() : undefined,
          cardReference: paymentMethod === "card" ? paymentReference.trim() : undefined,
          referenceNote: paymentNote.trim() || undefined,
          idempotencyKey: `payment-${deliveryId}-${Date.now()}`,
        },
        queuedMessage: "Payment was added to the sync queue.",
      });

      const completeResult = await submitOrQueue({
        endpoint: `/api/mobile/v1/deliveries/${deliveryId}/complete`,
        body: {
          idempotencyKey: `complete-${deliveryId}-${Date.now()}`,
          oldItemCollectionStatus: needsOldItemCollection ? oldItemCollectionStatus : undefined,
          oldItemCollectionRemark: needsOldItemCollection ? oldItemCollectionRemark.trim() || undefined : undefined,
        },
        queuedMessage: "Delivery completion was added to the sync queue.",
      });

      if (paymentResult.mode === "live" && completeResult.mode === "live") {
        Alert.alert("Order completed", "The order was completed successfully.");
      } else {
        Alert.alert("Queued", "Payment and delivery completion were added to the sync queue.");
      }

      await markCompleted({
        id: delivery.id,
        orderLabel: delivery.orderLabel,
        amount: delivery.amount,
        completedAt: new Date().toISOString(),
        customerName: delivery.customerName,
        companyLocation: delivery.companyLocation ?? null,
      });

      router.replace("/(tabs)/completed");
    } finally {
      setSubmitting(false);
    }
  }

  async function markFailed(deliveryId: string, failureReason: string) {
    await queueAction({
      endpoint: `/api/mobile/v1/deliveries/${deliveryId}/fail`,
      method: "POST",
      body: {
        reason: failureReason || "Customer unavailable",
        idempotencyKey: `fail-${deliveryId}-${Date.now()}`,
      },
    });
    Alert.alert("Queued", "Failure update was added to the sync queue.");
  }

  return {
    submitting,
    markDelivered,
    markFailed,
    requiresReference,
    amountsMatch,
  };
}
