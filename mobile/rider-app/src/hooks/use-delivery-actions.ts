import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import type { PaymentLineDraft } from "@/src/components/payment-form";
import { ApiError } from "@/src/api/client";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import { useSync } from "@/src/providers/sync";
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
  customerGaveAmount: string;
  paymentNote: string;
  oldItemCollectionStatus: OldItemCollectionStatus;
  oldItemCollectionRemark: string;
  cardSlipBase64?: string | null;
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

function stableIdempotencyKey(kind: "payment" | "complete" | "fail", tenant: TenantId, deliveryId: string) {
  return `${kind}-${tenant}-${deliveryId}`;
}

export function useDeliveryActions() {
  const router = useRouter();
  const { markCompleted } = useCompletedDeliveries();
  const { refreshPendingQueue } = useSync();
  const [submitting, setSubmitting] = useState(false);

  async function markDelivered(input: DeliveryActionInput) {
    if (submitting) return;

    const {
      tenant,
      deliveryId,
      delivery,
      paymentLines,
      customerGaveAmount,
      paymentNote,
      oldItemCollectionStatus,
      oldItemCollectionRemark,
      cardSlipBase64,
    } = input;

    const expectedAmount = Number(delivery.amount);
    const lines = normalizeLines(paymentLines, expectedAmount);
    const collectedTotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const cashDue = lines
      .filter((line) => line.paymentMethod === "cod")
      .reduce((sum, line) => sum + line.amount, 0);
    const gave = Number(customerGaveAmount || 0);
    const needsOldItemCollection = delivery.requiresOldItemCollection;
    const allowed = delivery.allowedPaymentMethods;
    const usesCard = lines.some((line) => line.paymentMethod === "card");
    const cardLast4 = lines.find((line) => line.paymentMethod === "card")?.cardReference?.trim() ?? "";

    if (lines.length === 0) {
      Alert.alert("Missing amount", "Enter at least one payment amount.");
      return;
    }

    if (allowed?.length) {
      const blocked = lines.find((line) => !allowed.includes(line.paymentMethod as PaymentMethod));
      if (blocked) {
        Alert.alert(
          "Payment method not allowed",
          blocked.paymentMethod === "card"
            ? "Card is not allowed on coupon COD orders. Use cash or bank transfer."
            : `Cannot use ${blocked.paymentMethod} on this order.`
        );
        return;
      }
    }

    if (!amountsMatch(delivery.amount, collectedTotal)) {
      Alert.alert(
        "Amount mismatch",
        "Payment parts must add up to the amount due before completing."
      );
      return;
    }

    if (cashDue > 0.009 && !(gave + 0.001 >= cashDue)) {
      Alert.alert(
        "Cash tender required",
        "Enter how much cash the customer gave. It must cover the cash due."
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
      if (line.paymentMethod === "bank_transfer" && !line.bankReference) {
        Alert.alert("Missing reference", "Enter the bank transfer reference.");
        return;
      }
      if (line.paymentMethod === "card" && !/^\d{4}$/.test(line.cardReference ?? "")) {
        Alert.alert("Last 4 digits", "Enter the last 4 digits of the card.");
        return;
      }
    }

    if (usesCard && !cardSlipBase64?.trim()) {
      Alert.alert("Slip photo required", "Take a photo of the card payment slip.");
      return;
    }

    setSubmitting(true);

    try {
      const tenderFields =
        cashDue > 0.009
          ? {
              customerGaveAmount: gave,
              changeAmount: Math.max(0, gave - cashDue),
            }
          : {};

      const cardProof = usesCard
        ? {
            cardLast4,
            cardSlipImageBase64: cardSlipBase64 ?? undefined,
          }
        : {};

      const closeBody =
        lines.length === 1
          ? {
              paymentMethod: lines[0].paymentMethod,
              collectedAmount: lines[0].amount,
              bankReference: lines[0].bankReference,
              cardReference: lines[0].cardReference,
              referenceNote: paymentNote.trim() || undefined,
              ...cardProof,
              ...tenderFields,
              idempotencyKey: stableIdempotencyKey("payment", tenant, deliveryId),
              completeIdempotencyKey: stableIdempotencyKey("complete", tenant, deliveryId),
              oldItemCollectionStatus: needsOldItemCollection ? oldItemCollectionStatus : undefined,
              oldItemCollectionRemark: needsOldItemCollection
                ? oldItemCollectionRemark.trim() || undefined
                : undefined,
            }
          : {
              lines: lines.map((line) => ({
                paymentMethod: line.paymentMethod,
                amount: line.amount,
                bankReference: line.bankReference,
                cardReference: line.cardReference,
                cardLast4: line.paymentMethod === "card" ? line.cardReference : undefined,
                referenceNote: paymentNote.trim() || undefined,
              })),
              ...cardProof,
              ...tenderFields,
              idempotencyKey: stableIdempotencyKey("payment", tenant, deliveryId),
              completeIdempotencyKey: stableIdempotencyKey("complete", tenant, deliveryId),
              oldItemCollectionStatus: needsOldItemCollection ? oldItemCollectionStatus : undefined,
              oldItemCollectionRemark: needsOldItemCollection
                ? oldItemCollectionRemark.trim() || undefined
                : undefined,
            };

      // One round-trip (payment+complete). Old two-step queue still works if offline path queues this.
      const closeResult = await submitOrQueue({
        tenant,
        endpoint: `/api/mobile/v1/deliveries/${deliveryId}/close`,
        body: closeBody,
        queuedMessage: "Payment + delivery done saved offline — will sync when online.",
      });

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
      await refreshPendingQueue();

      router.navigate("/(tabs)/deliveries");
      if (closeResult.mode === "live") {
        Alert.alert("Order completed", "Delivery marked done. Invoice close stays with finance.");
      } else {
        Alert.alert("Saved offline", "Payment and done will sync together when online.");
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not complete delivery";
      Alert.alert("Could not complete", message);
    } finally {
      setSubmitting(false);
    }
  }

  async function markFailed(tenant: TenantId, deliveryId: string, failureReason: string) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await submitOrQueue({
        tenant,
        endpoint: `/api/mobile/v1/deliveries/${deliveryId}/fail`,
        body: {
          reason: failureReason || "Customer unavailable",
          idempotencyKey: stableIdempotencyKey("fail", tenant, deliveryId),
        },
        queuedMessage: "Failure update was added to the sync queue.",
      });
      await refreshPendingQueue();
      if (result.mode === "live") {
        Alert.alert("Marked failed", "Delivery was marked as failed.");
      } else {
        Alert.alert("Saved offline", result.message);
      }
      router.navigate("/(tabs)/deliveries");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Could not mark failed";
      Alert.alert("Could not mark failed", message);
    } finally {
      setSubmitting(false);
    }
  }

  return {
    submitting,
    markDelivered,
    markFailed,
    requiresReference: requiresPaymentReference,
    amountsMatch,
  };
}
