import { useMemo } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CompanyBadge } from "@/src/components/company-badge";
import { ExchangePanel } from "@/src/components/exchange-panel";
import { PaymentForm } from "@/src/components/payment-form";
import { SpecialDeliveryBadges } from "@/src/components/special-delivery-badges";
import { useDeliveryActions } from "@/src/hooks/use-delivery-actions";
import { useDeliveryDetail } from "@/src/hooks/use-delivery-detail";
import { getTenantDefinition } from "@/src/tenants/config";
import { isTenantId } from "@/src/tenants/config";
import { useTheme } from "@/src/providers/theme";

export default function DeliveryDetailScreen() {
  const router = useRouter();
  const { tenant: tenantParam, id } = useLocalSearchParams<{ tenant: string; id: string }>();
  const {
    tenant,
    detail,
    loading,
    collectedAmount,
    setCollectedAmount,
    paymentMethod,
    setPaymentMethod,
    paymentReference,
    setPaymentReference,
    paymentNote,
    setPaymentNote,
    failureReason,
    setFailureReason,
    oldItemCollectionStatus,
    setOldItemCollectionStatus,
    oldItemCollectionRemark,
    setOldItemCollectionRemark,
  } = useDeliveryDetail(tenantParam, id);
  const { submitting, markDelivered, markFailed, requiresReference, amountsMatch } = useDeliveryActions();
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  if (!isTenantId(tenantParam) || !id) {
    return null;
  }

  if (loading || !detail || !tenant) return null;

  const delivery = detail.delivery;
  const companyLabel = getTenantDefinition(tenant).label;
  const expectedAmount = Number(delivery.amount);
  const enteredAmount = Number(collectedAmount || 0);
  const effectiveCollectedAmount =
    paymentMethod === "already_paid" && enteredAmount <= 0 ? expectedAmount : enteredAmount;
  const needsCollectionRemark =
    delivery.requiresOldItemCollection &&
    oldItemCollectionStatus === "not_collected" &&
    !oldItemCollectionRemark.trim();
  const isCompleteDisabled =
    submitting ||
    !amountsMatch(delivery.amount, effectiveCollectedAmount) ||
    (delivery.requiresOldItemCollection && oldItemCollectionStatus === "pending") ||
    needsCollectionRemark ||
    (requiresReference(paymentMethod) && !paymentReference.trim());

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Back to route</Text>
        </Pressable>

        <View style={styles.headerCard}>
          <CompanyBadge label={companyLabel} />
          <View style={styles.headerPill}>
            <Text style={styles.headerPillText}>{delivery.deliveryStatus}</Text>
          </View>
          <Text style={styles.title}>{delivery.orderLabel}</Text>
          <Text style={styles.meta}>{delivery.customerName ?? "Unknown customer"}</Text>
          <Text style={styles.meta}>{delivery.customerPhone ?? "No phone"}</Text>
          <Text style={styles.meta}>{delivery.companyLocation?.name ?? "Unknown location"}</Text>
          <Text style={styles.amountText}>{delivery.amount}</Text>
          <View style={styles.badgeRow}>
            <SpecialDeliveryBadges delivery={delivery} />
          </View>
        </View>

        {delivery.deliveryKind === "exchange" ? (
          <ExchangePanel
            delivery={delivery}
            oldItemCollectionStatus={oldItemCollectionStatus}
            oldItemCollectionRemark={oldItemCollectionRemark}
            onStatusChange={setOldItemCollectionStatus}
            onRemarkChange={setOldItemCollectionRemark}
          />
        ) : null}

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Items</Text>
          {delivery.lineItems.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.itemTitle}>{item.productTitle}</Text>
              <Text style={styles.itemMeta}>
                {item.quantity} x {item.price}
              </Text>
            </View>
          ))}
        </View>

        <PaymentForm
          collectedAmount={collectedAmount}
          paymentMethod={paymentMethod}
          paymentReference={paymentReference}
          paymentNote={paymentNote}
          submitting={submitting}
          disabled={isCompleteDisabled}
          requiresReference={requiresReference}
          onCollectedAmountChange={setCollectedAmount}
          onPaymentMethodChange={setPaymentMethod}
          onPaymentReferenceChange={setPaymentReference}
          onPaymentNoteChange={setPaymentNote}
          onSubmit={() =>
            void markDelivered({
              tenant,
              deliveryId: id,
              delivery,
              collectedAmount,
              paymentMethod,
              paymentReference,
              paymentNote,
              oldItemCollectionStatus,
              oldItemCollectionRemark,
            })
          }
        />

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Failed delivery</Text>
          <TextInput
            style={styles.input}
            value={failureReason}
            onChangeText={setFailureReason}
            placeholder="Reason"
            placeholderTextColor={colors.textSoft}
          />
          <Pressable style={[styles.button, styles.failButton]} onPress={() => void markFailed(tenant, id, failureReason)}>
            <Text style={styles.buttonText}>Queue failed delivery</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows
) {
  return StyleSheet.create({
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
      gap: 10,
      ...shadows.card,
    },
    headerPill: {
      alignSelf: "flex-start",
      borderRadius: radii.pill,
      backgroundColor: colors.brandSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    headerPillText: { color: colors.brand, fontWeight: "800", textTransform: "capitalize", fontSize: 12 },
    title: { fontSize: 26, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
    meta: { color: colors.textMuted, marginTop: 6, lineHeight: 20 },
    amountText: { marginTop: 14, color: colors.brand, fontSize: 28, fontWeight: "800" },
    badgeRow: { marginTop: 12 },
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
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      padding: 14,
      backgroundColor: colors.surfaceMuted,
      color: colors.text,
    },
    button: { borderRadius: radii.sm, backgroundColor: colors.brand, padding: 16, alignItems: "center" },
    failButton: { backgroundColor: colors.danger },
    buttonText: { color: colors.white, fontWeight: "800" },
  });
}
