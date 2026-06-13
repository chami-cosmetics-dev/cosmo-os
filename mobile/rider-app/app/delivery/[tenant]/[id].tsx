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
    return <BootstrapLoading message="Opening delivery…" />;
  }

  if (loading || !detail || !tenant) {
    return <BootstrapLoading message="Loading delivery…" />;
  }

  const delivery = detail.delivery;
  const companyLabel = getTenantDefinition(tenant).label;
  const statusLabel = getRouteBadgeLabel(delivery.deliveryStatus);
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
          <Text style={styles.sectionTitle}>Payment confirmation</Text>
          <Text style={styles.paymentHint}>Delivery fee: {formatMoney(delivery.amount, delivery.currency)}</Text>
          <Text style={styles.paymentHint}>Priority surcharge: {formatMoney("0", delivery.currency)}</Text>
          <Text style={styles.earnedTotal}>
            Total Earned{" "}
            <Text style={styles.earnedTotalValue}>{formatMoney(delivery.amount, delivery.currency)}</Text>
          </Text>
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
            <Feather name="x-circle" size={15} color={colors.white} />
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
    failButton: { backgroundColor: colors.danger },
    buttonText: { color: colors.white, fontWeight: "800" },
  });
}
