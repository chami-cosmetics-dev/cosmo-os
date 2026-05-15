import { useEffect, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiClient } from "@/src/api/client";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import { queueAction } from "@/src/storage/offline-queue";
import { colors, radii, shadows } from "@/src/theme";

type PaymentMethod = "cod" | "bank_transfer" | "card" | "already_paid";
type OldItemCollectionStatus = "pending" | "collected" | "not_collected";

type DeliveryDetail = {
  delivery: {
    id: string;
    orderLabel: string;
    customerName: string | null;
    customerPhone: string | null;
    amount: string;
    deliveryStatus: string;
    deliveryKind: "normal" | "rearranged" | "exchange";
    oldOrderLabel?: string | null;
    replacementOrderLabel?: string | null;
    requiresOldItemCollection: boolean;
    oldItemCollectionStatus: OldItemCollectionStatus;
    oldItemCollectionRemark?: string | null;
    exchangePaymentDifference?: string | null;
    expectedPaymentMethod?: PaymentMethod | null;
    companyLocation?: { name: string } | null;
    payment: {
      collectedAmount: string;
      collectionStatus: string;
      paymentMethod: PaymentMethod;
      referenceNote?: string | null;
      bankReference?: string | null;
      cardReference?: string | null;
    } | null;
    lineItems: Array<{
      id: string;
      productTitle: string;
      quantity: number;
      price: string;
    }>;
  };
};

export default function DeliveryDetailScreen() {
  const router = useRouter();
  const { markCompleted } = useCompletedDeliveries();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [collectedAmount, setCollectedAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [oldItemCollectionStatus, setOldItemCollectionStatus] =
    useState<OldItemCollectionStatus>("pending");
  const [oldItemCollectionRemark, setOldItemCollectionRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const data = await apiClient.get<DeliveryDetail>(`/api/mobile/v1/deliveries/${id}`);
    setDetail(data);
    setCollectedAmount(data.delivery.payment?.collectedAmount ?? data.delivery.amount);
    setPaymentMethod(data.delivery.payment?.paymentMethod ?? data.delivery.expectedPaymentMethod ?? "cod");
    setPaymentReference(data.delivery.payment?.bankReference ?? data.delivery.payment?.cardReference ?? "");
    setPaymentNote(data.delivery.payment?.referenceNote ?? "");
    setOldItemCollectionStatus(data.delivery.oldItemCollectionStatus ?? "pending");
    setOldItemCollectionRemark(data.delivery.oldItemCollectionRemark ?? "");
  }

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

  async function markDelivered() {
    if (!detail) return;

    const numericAmount = Number(collectedAmount || 0);
    const expectedAmount = Number(detail.delivery.amount);
    const effectiveCollectedAmount =
      paymentMethod === "already_paid" && numericAmount <= 0 ? expectedAmount : numericAmount;
    const needsOldItemCollection = detail.delivery.requiresOldItemCollection;

    if (paymentMethod === "cod" && numericAmount <= 0) {
      Alert.alert("Missing amount", "Enter the amount collected from the customer.");
      return;
    }

    if (!amountsMatch(detail.delivery.amount, effectiveCollectedAmount)) {
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
        endpoint: `/api/mobile/v1/deliveries/${id}/payment`,
        body: {
          paymentMethod,
          collectedAmount:
            paymentMethod === "already_paid" && numericAmount <= 0
              ? Number(detail.delivery.amount)
              : numericAmount,
          bankReference: paymentMethod === "bank_transfer" ? paymentReference.trim() : undefined,
          cardReference: paymentMethod === "card" ? paymentReference.trim() : undefined,
          referenceNote: paymentNote.trim() || undefined,
          idempotencyKey: `payment-${id}-${Date.now()}`,
        },
        queuedMessage: "Payment was added to the sync queue.",
      });

      const completeResult = await submitOrQueue({
        endpoint: `/api/mobile/v1/deliveries/${id}/complete`,
        body: {
          idempotencyKey: `complete-${id}-${Date.now()}`,
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
        id: detail.delivery.id,
        orderLabel: detail.delivery.orderLabel,
        amount: detail.delivery.amount,
        completedAt: new Date().toISOString(),
        customerName: detail.delivery.customerName,
        companyLocation: detail.delivery.companyLocation ?? null,
      });

      router.replace("/(tabs)/completed");
    } finally {
      setSubmitting(false);
    }
  }

  async function markFailed() {
    await queueAction({
      endpoint: `/api/mobile/v1/deliveries/${id}/fail`,
      method: "POST",
      body: {
        reason: failureReason || "Customer unavailable",
        idempotencyKey: `fail-${id}-${Date.now()}`,
      },
    });
    Alert.alert("Queued", "Failure update was added to the sync queue.");
  }

  useEffect(() => {
    if (id) {
      void load();
    }
  }, [id]);

  if (!detail) return null;
  const paymentDifference = Number(detail.delivery.exchangePaymentDifference ?? 0);
  const expectedAmount = Number(detail.delivery.amount);
  const enteredAmount = Number(collectedAmount || 0);
  const effectiveCollectedAmount =
    paymentMethod === "already_paid" && enteredAmount <= 0 ? expectedAmount : enteredAmount;
  const needsCollectionRemark =
    detail.delivery.requiresOldItemCollection &&
    oldItemCollectionStatus === "not_collected" &&
    !oldItemCollectionRemark.trim();
  const isCompleteDisabled =
    submitting ||
    !amountsMatch(detail.delivery.amount, effectiveCollectedAmount) ||
    (detail.delivery.requiresOldItemCollection && oldItemCollectionStatus === "pending") ||
    needsCollectionRemark ||
    (requiresReference(paymentMethod) && !paymentReference.trim());

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Back to route</Text>
        </Pressable>
        <View style={styles.headerCard}>
          <View style={styles.headerPill}>
            <Text style={styles.headerPillText}>{detail.delivery.deliveryStatus}</Text>
          </View>
          <Text style={styles.title}>{detail.delivery.orderLabel}</Text>
          <Text style={styles.meta}>{detail.delivery.customerName ?? "Unknown customer"}</Text>
          <Text style={styles.meta}>{detail.delivery.customerPhone ?? "No phone"}</Text>
          <Text style={styles.meta}>{detail.delivery.companyLocation?.name ?? "Unknown location"}</Text>
          <Text style={styles.amountText}>{detail.delivery.amount}</Text>
          <View style={styles.specialBadgeRow}>
            {detail.delivery.deliveryKind === "rearranged" ? (
              <View style={[styles.specialBadge, styles.rearrangedBadge]}>
                <Text style={styles.specialBadgeText}>Rearranged Order</Text>
              </View>
            ) : null}
            {detail.delivery.deliveryKind === "exchange" ? (
              <View style={[styles.specialBadge, styles.exchangeBadge]}>
                <Text style={styles.specialBadgeText}>Exchange</Text>
              </View>
            ) : null}
          </View>
        </View>

        {detail.delivery.deliveryKind === "exchange" ? (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Exchange instructions</Text>
            <Text style={styles.helperText}>
              Collect old order: {detail.delivery.oldOrderLabel ?? "Original order"}
            </Text>
            <Text style={styles.helperText}>
              Replacement: {detail.delivery.replacementOrderLabel ?? detail.delivery.orderLabel}
            </Text>
            <View style={styles.exchangeMoneyBox}>
              <Text style={styles.exchangeMoneyTitle}>
                {paymentDifference > 0
                  ? `Collect extra Rs. ${paymentDifference.toFixed(2)}`
                  : paymentDifference < 0
                    ? `Give change/refund Rs. ${Math.abs(paymentDifference).toFixed(2)}`
                    : "No payment difference"}
              </Text>
              <Text style={styles.helperText}>This is separate from normal delivery payment.</Text>
            </View>
            {detail.delivery.requiresOldItemCollection ? (
              <>
                <Text style={styles.helperText}>Old order collection status</Text>
                <View style={styles.optionRow}>
                  {([
                    ["collected", "Collected"],
                    ["not_collected", "Not collected"],
                  ] as Array<[OldItemCollectionStatus, string]>).map(([value, label]) => (
                    <Pressable
                      key={value}
                      style={[styles.optionChip, oldItemCollectionStatus === value ? styles.optionChipActive : null]}
                      onPress={() => setOldItemCollectionStatus(value)}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          oldItemCollectionStatus === value ? styles.optionChipTextActive : null,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {oldItemCollectionStatus === "not_collected" ? (
                  <TextInput
                    style={styles.input}
                    value={oldItemCollectionRemark}
                    onChangeText={setOldItemCollectionRemark}
                    placeholder="Why was the old order not collected?"
                  />
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Items</Text>
          {detail.delivery.lineItems.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.itemTitle}>{item.productTitle}</Text>
              <Text style={styles.itemMeta}>
                {item.quantity} x {item.price}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <Text style={styles.helperText}>Collect money from the customer, then save payment and submit delivery.</Text>
          <View style={styles.optionRow}>
            {([
              ["cod", "COD"],
              ["bank_transfer", "Bank"],
              ["card", "Card"],
              ["already_paid", "Online"],
            ] as Array<[PaymentMethod, string]>).map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.optionChip, paymentMethod === value ? styles.optionChipActive : null]}
                onPress={() => setPaymentMethod(value)}
              >
                <Text style={[styles.optionChipText, paymentMethod === value ? styles.optionChipTextActive : null]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={collectedAmount}
            onChangeText={setCollectedAmount}
            placeholder="Collected amount"
          />
          {requiresReference(paymentMethod) ? (
            <TextInput
              style={styles.input}
              value={paymentReference}
              onChangeText={setPaymentReference}
              placeholder="Payment reference"
            />
          ) : null}
          <TextInput
            style={styles.input}
            value={paymentNote}
            onChangeText={setPaymentNote}
            placeholder="Note (optional)"
          />
          <Pressable
            style={[styles.button, isCompleteDisabled ? styles.buttonDisabled : null]}
            onPress={() => void markDelivered()}
            disabled={isCompleteDisabled}
          >
            <Text style={styles.buttonText}>{submitting ? "Submitting..." : "Save payment and complete"}</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Failed delivery</Text>
          <TextInput style={styles.input} value={failureReason} onChangeText={setFailureReason} placeholder="Reason" />
          <Pressable style={[styles.button, styles.failButton]} onPress={() => void markFailed()}>
            <Text style={styles.buttonText}>Queue failed delivery</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 28 },
  backLink: { alignSelf: "flex-start", marginBottom: 4 },
  backLinkText: { color: colors.brand, fontWeight: "700" },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  headerPill: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  headerPillText: { color: colors.brand, fontWeight: "800", textTransform: "capitalize", fontSize: 12 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  meta: { color: colors.textMuted, marginTop: 6, lineHeight: 20 },
  amountText: { marginTop: 14, color: colors.brand, fontSize: 28, fontWeight: "800" },
  specialBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  specialBadge: {
    alignSelf: "flex-start",
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  rearrangedBadge: { backgroundColor: "#e0f2fe", borderColor: "#bae6fd" },
  exchangeBadge: { backgroundColor: "#ede9fe", borderColor: "#ddd6fe" },
  specialBadgeText: { color: colors.slate, fontSize: 11, fontWeight: "800" },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
    ...shadows.card,
  },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  row: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  itemTitle: { color: colors.text, fontWeight: "700" },
  itemMeta: { color: colors.textMuted, marginTop: 4 },
  helperText: { color: colors.textMuted, lineHeight: 20 },
  exchangeMoneyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    padding: 12,
    gap: 4,
  },
  exchangeMoneyTitle: { color: colors.slate, fontWeight: "800", fontSize: 16 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
  },
  optionChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  optionChipText: { color: colors.textMuted, fontWeight: "700" },
  optionChipTextActive: { color: colors.white },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 14,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
  },
  button: { borderRadius: radii.sm, backgroundColor: colors.brand, padding: 16, alignItems: "center" },
  buttonDisabled: { opacity: 0.7 },
  failButton: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontWeight: "800" },
});
