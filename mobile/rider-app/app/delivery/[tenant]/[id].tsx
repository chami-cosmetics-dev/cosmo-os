import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { CompanyBadge } from "@/src/components/company-badge";
import { DeliveryContactSection, DeliveryMapCard } from "@/src/components/delivery-contact-section";
import { ExchangePanel } from "@/src/components/exchange-panel";
import { PaymentForm } from "@/src/components/payment-form";
import { SpecialDeliveryBadges } from "@/src/components/special-delivery-badges";
import { BootstrapLoading } from "@/src/components/bootstrap-loading";
import { useDeliveryActions } from "@/src/hooks/use-delivery-actions";
import { useDeliveryDetail } from "@/src/hooks/use-delivery-detail";
import { getTenantDefinition, isTenantId } from "@/src/tenants/config";
import { useTheme } from "@/src/providers/theme";
import { getPriorityLabel, getRouteBadgeLabel } from "@/src/utils/delivery";
import { formatMoney } from "@/src/utils/money";

export default function DeliveryDetailScreen() {
  const router = useRouter();
  const { tenant: tenantParam, id } = useLocalSearchParams<{ tenant: string; id: string }>();
  const {
    tenant,
    detail,
    loading,
    paymentLines,
    setPaymentLines,
    customerGaveAmount,
    setCustomerGaveAmount,
    paymentNote,
    setPaymentNote,
    failureReason,
    setFailureReason,
    oldItemCollectionStatus,
    setOldItemCollectionStatus,
    oldItemCollectionRemark,
    setOldItemCollectionRemark,
    cardSlipUri,
    cardSlipBase64,
    pickCardSlip,
  } = useDeliveryDetail(tenantParam, id);
  const { submitting, markDelivered, markFailed, requiresReference, amountsMatch } = useDeliveryActions();
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  if (!isTenantId(tenantParam) || !id) {
    return <BootstrapLoading message="Opening delivery…" />;
  }

  if (loading || !detail || !tenant) {
    return <BootstrapLoading message="Loading delivery…" />;
  }

  const delivery = detail.delivery;
  const companyLabel = getTenantDefinition(tenant).label;
  const statusLabel = getRouteBadgeLabel(delivery.deliveryStatus);
  const expectedAmount = Number(delivery.amount);
  const linesTotal = paymentLines.reduce((sum, line) => {
    const amount = Number(line.amount || 0);
    if (line.paymentMethod === "already_paid" && amount <= 0) return sum + expectedAmount;
    return sum + amount;
  }, 0);
  const cashDue = paymentLines
    .filter((line) => line.paymentMethod === "cod")
    .reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const gave = Number(customerGaveAmount || 0);
  const needsCollectionRemark =
    delivery.requiresOldItemCollection &&
    oldItemCollectionStatus === "not_collected" &&
    !oldItemCollectionRemark.trim();
  const missingReference = paymentLines.some((line) => {
    if (line.paymentMethod === "bank_transfer") return !line.reference.trim();
    if (line.paymentMethod === "card") return !/^\d{4}$/.test(line.reference.trim());
    return false;
  });
  const usesCard = paymentLines.some((line) => line.paymentMethod === "card");
  const isCompleteDisabled =
    submitting ||
    !amountsMatch(delivery.amount, linesTotal) ||
    (delivery.requiresOldItemCollection && oldItemCollectionStatus === "pending") ||
    needsCollectionRemark ||
    missingReference ||
    (usesCard && !cardSlipBase64) ||
    (cashDue > 0.009 && gave + 0.001 < cashDue);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Feather name="arrow-left" size={16} color={colors.brand} />
          <Text style={styles.backLinkText}>Back to route</Text>
        </Pressable>

        <View style={styles.heroCard}>
          <CompanyBadge label={companyLabel} />
          <Text style={styles.heroTitle}>
            {delivery.orderLabel}
            {"\n"}
            {getPriorityLabel(delivery)}
          </Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Amount</Text>
              <Text style={styles.heroStatValue}>{formatMoney(delivery.amount, delivery.currency)}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Location</Text>
              <Text style={styles.heroStatValue} numberOfLines={2}>
                {delivery.companyLocation?.name ?? "Unknown"}
              </Text>
            </View>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>{statusLabel}</Text>
          </View>
          <View style={styles.badgeRow}>
            <SpecialDeliveryBadges delivery={delivery} />
          </View>
        </View>

        <DeliveryMapCard
          customerName={delivery.customerName}
          customerPhone={delivery.customerPhone}
          shippingAddress={delivery.shippingAddress}
          billingAddress={delivery.billingAddress}
        />

        <DeliveryContactSection
          customerName={delivery.customerName}
          customerPhone={delivery.customerPhone}
          shippingAddress={delivery.shippingAddress}
          billingAddress={delivery.billingAddress}
        />

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
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Package Manifest</Text>
            <Text style={styles.sectionMeta}>{delivery.lineItems.length} items</Text>
          </View>
          {delivery.lineItems.map((item) => (
            <View key={item.id} style={styles.listRow}>
              <View style={styles.listIcon}>
                <Feather name="archive" size={12} color={colors.textSoft} />
              </View>
              <View style={styles.listBody}>
                <Text style={styles.listTitle}>{item.productTitle}</Text>
                <Text style={styles.listSub}>
                  {item.quantity} x {item.price}
                </Text>
              </View>
              <Text style={styles.listMeta}>{item.quantity}x</Text>
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Collect at door</Text>
          <Text style={styles.paymentHint}>
            {delivery.collectionKind === "prepaid"
              ? "Already paid — collect Rs. 0"
              : delivery.collectionKind === "partial"
                ? `Part paid — collect ${formatMoney(delivery.amount, delivery.currency)}`
                : `Collect ${formatMoney(delivery.amount, delivery.currency)}`}
          </Text>
          {delivery.orderTotal && delivery.collectionKind !== "full" ? (
            <Text style={styles.paymentHint}>
              Order total {formatMoney(delivery.orderTotal, delivery.currency)}
            </Text>
          ) : null}
          <Text style={styles.earnedTotal}>
            Rider pay{" "}
            <Text style={styles.earnedTotalValue}>
              {formatMoney(delivery.incentiveAmount ?? "0", delivery.currency)}
            </Text>
          </Text>
        </View>

        <PaymentForm
          expectedAmount={expectedAmount}
          currency={delivery.currency}
          lines={paymentLines}
          customerGaveAmount={customerGaveAmount}
          paymentNote={paymentNote}
          submitting={submitting}
          disabled={isCompleteDisabled}
          allowedMethods={delivery.allowedPaymentMethods}
          collectionKind={delivery.collectionKind}
          orderTotal={delivery.orderTotal}
          discountCouponCode={delivery.discountCouponCode}
          cardSlipUri={cardSlipUri}
          requiresReference={requiresReference}
          onLinesChange={setPaymentLines}
          onCustomerGaveAmountChange={setCustomerGaveAmount}
          onPaymentNoteChange={setPaymentNote}
          onPickCardSlip={() => void pickCardSlip()}
          onSubmit={() =>
            void markDelivered({
              tenant,
              deliveryId: id,
              delivery,
              paymentLines,
              customerGaveAmount,
              paymentNote,
              cardSlipBase64,
              oldItemCollectionStatus,
              oldItemCollectionRemark,
            })
          }
        />

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Failed delivery</Text>
          <Text style={styles.paymentHint}>Tap a reason, or type your own.</Text>
          <View style={styles.failChipRow}>
            {(
              [
                "Customer not respond",
                "Customer refused",
                "Wrong address",
                "Customer unavailable",
              ] as const
            ).map((reason) => {
              const active = failureReason.trim() === reason;
              return (
                <Pressable
                  key={reason}
                  style={[styles.failChip, active ? styles.failChipActive : null]}
                  onPress={() => setFailureReason(reason)}
                >
                  <Text style={[styles.failChipText, active ? styles.failChipTextActive : null]}>
                    {reason}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            value={failureReason}
            onChangeText={setFailureReason}
            placeholder="Or type another reason"
            placeholderTextColor={colors.textSoft}
          />
          <Pressable
            style={[styles.button, styles.failButton, submitting ? styles.buttonDisabled : null]}
            disabled={submitting || !failureReason.trim()}
            onPress={() => void markFailed(tenant, id, failureReason.trim())}
          >
            <Feather name="x-circle" size={15} color={colors.white} />
            <Text style={styles.buttonText}>
              {submitting ? "Saving…" : "Mark as failed"}
            </Text>
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
    backLink: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
    backLinkText: { color: colors.brand, fontWeight: "700" },
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
      ...shadows.card,
    },
    heroTitle: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.5, lineHeight: 32 },
    heroStats: { flexDirection: "row", gap: 10 },
    heroStat: {
      flex: 1,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.sm,
      padding: 12,
      gap: 4,
    },
    heroStatLabel: { color: colors.textSoft, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
    heroStatValue: { color: colors.text, fontWeight: "800", fontSize: 15 },
    heroBadge: {
      alignSelf: "flex-start",
      borderRadius: radii.pill,
      backgroundColor: colors.brandSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    heroBadgeText: { color: colors.brand, fontWeight: "800", textTransform: "capitalize", fontSize: 12 },
    badgeRow: { marginTop: 2 },
    panel: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
      ...shadows.card,
    },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
    sectionMeta: { color: colors.textSoft, fontWeight: "700", fontSize: 12 },
    listRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 12,
    },
    listIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    listBody: { flex: 1, gap: 2 },
    listTitle: { color: colors.text, fontWeight: "700" },
    listSub: { color: colors.textMuted, fontSize: 13 },
    listMeta: { color: colors.textSoft, fontWeight: "800" },
    paymentHint: { color: colors.textMuted, lineHeight: 20 },
    earnedTotal: { color: colors.text, fontWeight: "700", marginTop: 4 },
    earnedTotalValue: { color: colors.brand, fontWeight: "800", fontSize: 18 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      padding: 14,
      backgroundColor: colors.surfaceMuted,
      color: colors.text,
    },
    button: {
      borderRadius: radii.sm,
      backgroundColor: colors.brand,
      padding: 16,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    buttonDisabled: { opacity: 0.55 },
    failButton: { backgroundColor: colors.danger },
    failChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    failChip: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surfaceMuted,
    },
    failChipActive: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
    failChipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
    failChipTextActive: { color: colors.danger },
    buttonText: { color: colors.white, fontWeight: "800" },
  });
}
