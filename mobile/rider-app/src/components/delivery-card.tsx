import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CompanyBadge } from "@/src/components/company-badge";
import { SpecialDeliveryBadges } from "@/src/components/special-delivery-badges";
import { useSync } from "@/src/providers/sync";
import { useTheme } from "@/src/providers/theme";
import type { TenantMobileDelivery } from "@/src/types";
import { getAddressText } from "@/src/utils/contact";
import { getPriorityLabel, getRouteBadgeLabel } from "@/src/utils/delivery";
import { formatMoney } from "@/src/utils/money";

type DeliveryCardProps = {
  delivery: TenantMobileDelivery;
  onPress: () => void;
  compact?: boolean;
};

function hasQueuedAction(deliveryId: string, queuedEndpoints: string[]) {
  return queuedEndpoints.some((endpoint) => endpoint.includes(deliveryId));
}

export function DeliveryCard({ delivery, onPress, compact = false }: DeliveryCardProps) {
  const { queuedActions } = useSync();
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows, compact), [colors, radii, shadows, compact]);

  const queuedEndpoints = queuedActions.map((action) => action.endpoint);
  const isNotSynced = hasQueuedAction(delivery.id, queuedEndpoints);
  const routeBadgeLabel = getRouteBadgeLabel(delivery.deliveryStatus);
  const addressText = getAddressText(delivery);
  const locationName = delivery.companyLocation?.name ?? "Unknown location";
  const priorityLabel = getPriorityLabel(delivery);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={styles.main}>
          {!compact ? <CompanyBadge label={delivery.companyLabel} compact /> : null}
          <Text style={styles.code} numberOfLines={1}>
            {delivery.orderLabel}
          </Text>
          <Text style={styles.customer} numberOfLines={compact ? 1 : 2}>
            {delivery.customerName ?? "Unknown customer"}
          </Text>
        </View>
        <View style={styles.rightCol}>
          <Text style={styles.amount}>{formatMoney(delivery.amount, delivery.currency)}</Text>
          <View
            style={[
              styles.badge,
              delivery.deliveryStatus === "accepted"
                ? styles.badgeTransit
                : delivery.deliveryStatus === "assigned"
                  ? styles.badgeNext
                  : styles.badgeArrived,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                delivery.deliveryStatus === "accepted"
                  ? styles.badgeTextTransit
                  : delivery.deliveryStatus === "assigned"
                    ? styles.badgeTextNext
                    : styles.badgeTextArrived,
              ]}
            >
              {routeBadgeLabel}
            </Text>
          </View>
        </View>
      </View>

      {compact ? (
        <View style={styles.compactMetaRow}>
          <CompanyBadge label={delivery.companyLabel} compact />
          <Text style={styles.metaText} numberOfLines={1}>
            {locationName} · {priorityLabel}
          </Text>
        </View>
      ) : null}

      <SpecialDeliveryBadges delivery={delivery} />

      <View style={styles.locationRow}>
        <Feather name="map-pin" size={compact ? 11 : 12} color={colors.textMuted} />
        <Text style={styles.locationText} numberOfLines={1}>
          {addressText}
        </Text>
      </View>

      {!compact ? (
        <>
          <Text style={styles.district}>{locationName.toUpperCase()}</Text>
          <Text style={styles.footerLabel}>{priorityLabel}</Text>
        </>
      ) : null}

      {delivery.requiresOldItemCollection ? (
        <Text style={styles.hint} numberOfLines={1}>
          Old order: {delivery.oldOrderLabel ?? "Check exchange details"}
        </Text>
      ) : null}
      {isNotSynced ? <Text style={styles.unsynced}>Not synced</Text> : null}
    </Pressable>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows,
  compact: boolean
) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: compact ? radii.md : radii.lg,
      padding: compact ? 12 : 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: compact ? 6 : 10,
      ...shadows.card,
    },
    topRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "flex-start" },
    main: { flex: 1, gap: compact ? 2 : 6, minWidth: 0 },
    rightCol: { alignItems: "flex-end", gap: compact ? 4 : 6, flexShrink: 0 },
    code: { fontSize: compact ? 15 : 18, fontWeight: "800", color: colors.text, letterSpacing: -0.2 },
    customer: { color: colors.textMuted, fontSize: compact ? 12 : 14, lineHeight: compact ? 16 : 20 },
    badge: {
      borderRadius: radii.pill,
      paddingHorizontal: compact ? 8 : 10,
      paddingVertical: compact ? 4 : 6,
      borderWidth: 1,
    },
    badgeTransit: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
    badgeNext: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    badgeArrived: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
    badgeText: { fontWeight: "800", fontSize: compact ? 10 : 11, textTransform: "capitalize" },
    badgeTextTransit: { color: colors.brand },
    badgeTextNext: { color: colors.accent },
    badgeTextArrived: { color: colors.text },
    compactMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    metaText: { flex: 1, color: colors.textSoft, fontSize: 11, fontWeight: "600" },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.pill,
      paddingHorizontal: compact ? 8 : 10,
      paddingVertical: compact ? 6 : 8,
    },
    locationText: { flex: 1, color: colors.textMuted, fontSize: compact ? 11 : 12 },
    amount: { fontSize: compact ? 14 : 18, fontWeight: "800", color: colors.emphasis, textAlign: "right" },
    district: { color: colors.textSoft, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
    footerLabel: { color: colors.brand, fontWeight: "700", fontSize: compact ? 12 : 13 },
    hint: { color: colors.textSoft, fontSize: 11 },
    unsynced: { color: colors.danger, fontWeight: "700", fontSize: 11 },
  });
}
