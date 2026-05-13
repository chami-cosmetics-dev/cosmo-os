import { useEffect, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiClient } from "@/src/api/client";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import { queueAction } from "@/src/storage/offline-queue";
import { colors, radii, shadows } from "@/src/theme";

type PaymentMethod = "cod" | "bank_transfer" | "card" | "already_paid";

type DeliveryDetail = {
  delivery: {
    id: string;
    orderLabel: string;
    customerName: string | null;
    customerPhone: string | null;
    amount: string;
    deliveryStatus: string;
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
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const data = await apiClient.get<DeliveryDetail>(`/api/mobile/v1/deliveries/${id}`);
    setDetail(data);
    setCollectedAmount(data.delivery.payment?.collectedAmount ?? data.delivery.amount);
    setPaymentMethod(data.delivery.payment?.paymentMethod ?? data.delivery.expectedPaymentMethod ?? "cod");
    setPaymentReference(data.delivery.payment?.bankReference ?? data.delivery.payment?.cardReference ?? "");
    setPaymentNote(data.delivery.payment?.referenceNote ?? "");
  }

  function requiresReference(method: PaymentMethod) {
    return method === "bank_transfer" || method === "card";
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

    if (paymentMethod === "cod" && numericAmount <= 0) {
      Alert.alert("Missing amount", "Enter the amount collected from the customer.");
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
            paymentMethod === "already_paid" && numericAmount <= 0 ? Number(detail.delivery.amount) : numericAmount,
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
        </View>

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
            style={[styles.button, submitting ? styles.buttonDisabled : null]}
            onPress={() => void markDelivered()}
            disabled={submitting}
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
