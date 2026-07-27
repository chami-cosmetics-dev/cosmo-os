import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import type { PaymentLineDraft } from "@/src/components/payment-form";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import { getTenantDefinition } from "@/src/tenants/config";
import type { TenantId } from "@/src/tenants/config";
import type { MobileDeliveryDetail, OldItemCollectionStatus, PaymentMethod } from "@/src/types";
import { amountsMatch, requiresPaymentReference } from "@/src/utils/delivery";
import { submitOrQueue } from "@/src/utils/submit-or-queue";

type DeliveryActionInput = {
  tenant: TenantId;
  deliveryId: string;
  delivery: MobileDeliveryDetail;
  paymentLines: PaymentLineDraft[];
  paymentNote: string;
  oldItemCollectionStatus: OldItemCollectionStatus;
  oldItemCollectionRemark: string;
};

function normalizeLines(lines: PaymentLineDraft[], expectedAmount: number) {
  return lines
    .map((line) => {
      const amount =
        line.paymentMethod === "already_paid" && !(Number(line.amount) > 0)
          ? expectedAmount
          : Number(line.amount || 0);
      return {
        paymentMethod: line.paymentMethod,
        amount,
        bankReference:
          line.paymentMethod === "bank_transfer" ? line.reference.trim() || undefined : undefined,
        cardReference: line.paymentMethod === "card" ? line.reference.trim() || undefined : undefined,
      };
    })
    .filter((line) => line.amount > 0 || line.paymentMethod === "already_paid");
}

export function useDeliveryActions() {
  const router = useRouter();
  const { markCompleted } = useCompletedDeliveries();
  const [submitting, setSubmitting] = useState(false);

  async function markDelivered(input: DeliveryActionInput) {
    const {
      tenant,
      deliveryId,
      delivery,
      paymentLines,
      paymentNote,
      oldItemCollectionStatus,
      oldItemCollectionRemark,
    } = input;

    const expectedAmount = Number(delivery.amount);
    const lines = normalizeLines(paymentLines, expectedAmount);
    const collectedTotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const needsOldItemCollection = delivery.requiresOldItemCollection;

    if (lines.length === 0) {
      Alert.alert("Missing amount", "Enter at least one payment amount.");
      return;
    }

    if (!amountsMatch(delivery.amount, collectedTotal)) {
      Alert.alert(
        "Amount mismatch",
        "Payment parts must add up to the order amount before completing."
      );
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

    for (const line of lines) {
      if (requiresPaymentReference(line.paymentMethod)) {
        const hasRef =
          (line.paymentMethod === "bank_transfer" && line.bankReference) ||
          (line.paymentMethod === "card" && line.cardReference);
        if (!hasRef) {
          Alert.alert("Missing reference", "Enter the payment reference for bank/card parts.");
          return;
        }
      }
    }

    setSubmitting(true);

    try {
      const paymentBody =
        lines.length === 1
          ? {
              paymentMethod: lines[0].paymentMethod,
              collectedAmount: lines[0].amount,
              bankReference: lines[0].bankReference,
              cardReference: lines[0].cardReference,
              referenceNote: paymentNote.trim() || undefined,
              idempotencyKey: `payment-${tenant}-${deliveryId}-${Date.now()}`,
            }
          : {
              lines: lines.map((line) => ({
                paymentMethod: line.paymentMethod,
                amount: line.amount,
                bankReference: line.bankReference,
                cardReference: line.cardReference,
                referenceNote: paymentNote.trim() || undefined,
              })),
              idempotencyKey: `payment-${tenant}-${deliveryId}-${Date.now()}`,
            };

      const paymentResult = await submitOrQueue({
        tenant,
        endpoint: `/api/mobile/v1/deliveries/${deliveryId}/payment`,
        body: paymentBody,
        queuedMessage: "Payment was added to the sync queue.",
      });

      const completeResult = await submitOrQueue({
        tenant,
        endpoint: `/api/mobile/v1/deliveries/${deliveryId}/complete`,
        body: {
          idempotencyKey: `complete-${tenant}-${deliveryId}-${Date.now()}`,
          oldItemCollectionStatus: needsOldItemCollection ? oldItemCollectionStatus : undefined,
          oldItemCollectionRemark: needsOldItemCollection
            ? oldItemCollectionRemark.trim() || undefined
            : undefined,
        },
        queuedMessage: "Delivery completion was added to the sync queue.",
      });

      if (paymentResult.mode === "live" && completeResult.mode === "live") {
        Alert.alert("Order completed", "The order was completed successfully.");
      } else {
        Alert.alert("Queued", "Payment and delivery completion were added to the sync queue.");
      }

      await markCompleted({
        tenant,
        id: delivery.id,
        orderLabel: delivery.orderLabel,
        amount: delivery.amount,
        completedAt: new Date().toISOString(),
        customerName: delivery.customerName,
        companyLocation: delivery.companyLocation ?? null,
        companyLabel: getTenantDefinition(tenant).label,
      });

      router.navigate("/(tabs)/completed");
    } finally {
      setSubmitting(false);
    }
  }

  async function markFailed(tenant: TenantId, deliveryId: string, failureReason: string) {
    await submitOrQueue({
      tenant,
      endpoint: `/api/mobile/v1/deliveries/${deliveryId}/fail`,
      body: {
        reason: failureReason || "Customer unavailable",
        idempotencyKey: `fail-${tenant}-${deliveryId}-${Date.now()}`,
      },
      queuedMessage: "Failure update was added to the sync queue.",
    });
    Alert.alert("Queued", "Failure update was added to the sync queue.");
  }

  return {
    submitting,
    markDelivered,
    markFailed,
    requiresReference: requiresPaymentReference,
    amountsMatch,
  };
}
