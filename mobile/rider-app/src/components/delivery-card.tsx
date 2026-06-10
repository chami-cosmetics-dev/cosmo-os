import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MobileDelivery } from "@/src/types";
import { SpecialDeliveryBadges } from "@/src/components/special-delivery-badges";
import { useTheme } from "@/src/providers/theme";

type DeliveryCardProps = {
  delivery: MobileDelivery;
  onPress: () => void;
};

export function DeliveryCard({ delivery, onPress }: DeliveryCardProps) {
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.top}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{delivery.orderLabel}</Text>
          <Text style={styles.meta}>{delivery.customerName ?? "Unknown customer"}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{delivery.deliveryStatus}</Text>
        </View>
      </View>
      <SpecialDeliveryBadges delivery={delivery} />
      <Text style={styles.meta}>{delivery.companyLocation?.name ?? "Unknown location"}</Text>
      <View style={styles.footer}>
        <Text style={styles.amount}>{delivery.amount}</Text>
        <Text style={styles.hint}>
          {delivery.payment ? `Payment ${delivery.payment.collectionStatus}` : "Open delivery"}
        </Text>
      </View>
      {delivery.requiresOldItemCollection ? (
        <Text style={styles.hint}>Old order: {delivery.oldOrderLabel ?? "Check exchange details"}</Text>
      ) : null}
    </Pressable>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows
) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
      ...shadows.card,
    },
    top: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
    titleWrap: { flex: 1, gap: 4 },
    title: { fontSize: 18, fontWeight: "800", color: colors.text },
    meta: { color: colors.textMuted, lineHeight: 20 },
    badge: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.sm,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: colors.border,
    },
    badgeText: { color: colors.slate, textTransform: "capitalize", fontWeight: "700", fontSize: 12 },
    footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 2 },
    amount: { fontSize: 22, fontWeight: "800", color: colors.slate },
    hint: { color: colors.textSoft, fontSize: 13, flexShrink: 1, textAlign: "right" },
  });
}
